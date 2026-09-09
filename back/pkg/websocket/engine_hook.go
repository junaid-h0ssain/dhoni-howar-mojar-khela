package websocket

import (
	"context"
	"errors"
	"time"

	"backend/pkg/game"
	"backend/pkg/models"
	"backend/pkg/store"
)

// tryEngineAction handles game-rule +connection actions on the room goroutine.
// Returns true if the message was consumed (even as an error).
func (r *Room) tryEngineAction(c *Client, msg models.Message) bool {
	switch msg.Type {
	case "__disconnect__":
		playerID, _ := msg.Payload["playerId"].(string)
		if p := r.Engine.FindPlayer(playerID); p != nil {
			p.IsConnected = false
			r.Engine.AppendLog(p.Name + " সংযোগ বিচ্ছিন্ন হয়েছেন।")
			r.emit(models.EvPlayerDisconnected, map[string]any{"playerId": playerID})
			r.emitState()
			// Reconnection window (§11); on expiry the seat is freed and a
			// stuck turn is forfeited so the game never stalls.
			go func() {
				time.Sleep(store.ReconnectTTL)
				select {
				case r.actions <- inboundAction{msg: models.Message{
					Type:    "__reconnect_timeout__",
					Payload: map[string]any{"playerId": playerID},
				}}:
				case <-r.quit:
				}
			}()
		}
		return true

	case "__reconnect_timeout__":
		playerID, _ := msg.Payload["playerId"].(string)
		if p := r.Engine.FindPlayer(playerID); p != nil && !p.IsConnected {
			_ = r.hub.sessions.Delete(context.Background(), c.sessionToken)
			if r.Engine.ForfeitTurn(playerID) {
				r.Engine.AppendLog(p.Name + " সময়মতো ফিরে না আসায় চাল বাতিল হয়েছে।")
			}
			r.emit(models.EvPlayerLeft, map[string]any{"playerId": playerID})
			r.emitState()
		}
		return true

	case models.ActRollDice:
		o, err := r.Engine.RollDice(c.playerID)
		r.finishEngineCall(c, msg, o, err)
		return true

	case models.ActBuyProperty:
		tileID, ok := tileIDFrom(msg.Payload)
		if !ok {
			c.sendError("INVALID_TILE", "ঘর নম্বর ভুল।", msg.RequestID)
			return true
		}
		o, err := r.Engine.BuyProperty(c.playerID, tileID)
		r.finishEngineCall(c, msg, o, err)
		return true

	case models.ActBuildHouse:
		tileID, ok := tileIDFrom(msg.Payload)
		if !ok {
			c.sendError("INVALID_TILE", "ঘর নম্বর ভুল।", msg.RequestID)
			return true
		}
		o, err := r.Engine.BuildHouse(c.playerID, tileID)
		r.finishEngineCall(c, msg, o, err)
		return true

	case models.ActEndTurn:
		o, err := r.Engine.EndTurn(c.playerID)
		r.finishEngineCall(c, msg, o, err)
		return true
	}
	return false
}

// finishEngineCall maps engine errors to ERROR events and successful outcomes
// to granular events, then always broadcasts the authoritative GAME_STATE.
func (r *Room) finishEngineCall(c *Client, msg models.Message, o *game.Outcome, err error) {
	if err != nil {
		var ee *game.EngineError
		if errors.As(err, &ee) {
			c.sendError(ee.Code, ee.Msg, msg.RequestID)
		} else {
			c.sendError("ACTION_FAILED", "চাল দেওয়া যায়নি।", msg.RequestID)
		}
		return
	}
	me := c.playerID
	if o.Rolled {
		r.emit(models.EvDiceRolled, map[string]any{
			"playerId": me, "dice": []int{o.Dice[0], o.Dice[1]}, "doubles": o.Doubles,
		})
	}
	if o.Moved {
		r.emit(models.EvPlayerMoved, map[string]any{
			"playerId": me, "from": o.MovedFrom, "to": o.MovedTo, "passedGo": o.PassedGo,
		})
	}
	if o.Purchased {
		r.emit(models.EvPropertyPurchased, map[string]any{
			"playerId": me, "tileId": o.PurchasedTileID,
		})
	}
	if o.Built {
		r.emit(models.EvHouseBuilt, map[string]any{
			"playerId": me, "tileId": o.BuiltTileID, "houses": o.BuiltLevel,
		})
	}
	for _, pid := range o.Bankrupted {
		r.emit(models.EvPlayerBankrupt, map[string]any{"playerId": pid})
	}
	if o.Finished {
		r.emit(models.EvGameFinished, map[string]any{"winnerId": o.WinnerID})
	}
	r.emitState()
}

func tileIDFrom(payload map[string]any) (int, bool) {
	if payload == nil {
		return 0, false
	}
	switch v := payload["tileId"].(type) {
	case float64:
		if v < 0 || v > 39 {
			return 0, false
		}
		return int(v), true
	case int:
		if v < 0 || v > 39 {
			return 0, false
		}
		return v, true
	}
	return 0, false
}
