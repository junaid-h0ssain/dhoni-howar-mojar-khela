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
		sessionToken, _ := msg.Payload["sessionToken"].(string)
		if p := r.Engine.FindPlayer(playerID); p != nil {
			p.IsConnected = false
			r.Engine.AppendLog(p.Name + " সংযোগ বিচ্ছিন্ন হয়েছেন।")
			r.emit(models.EvPlayerDisconnected, map[string]any{"playerId": playerID})
			r.emitState()
			// Reconnection window (§11); on expiry the seat is freed and a
			// stuck turn is forfeited so the game never stalls.
			// The timeout carries its own payload because it runs with no
			// client attached — the handler must never touch c here.
			go func() {
				time.Sleep(store.ReconnectTTL)
				select {
				case r.actions <- inboundAction{msg: models.Message{
					Type: "__reconnect_timeout__",
					Payload: map[string]any{
						"playerId": playerID, "sessionToken": sessionToken,
					},
				}}:
				case <-r.quit:
				}
			}()
		}
		return true

	case "__reconnect_timeout__":
		playerID, _ := msg.Payload["playerId"].(string)
		if p := r.Engine.FindPlayer(playerID); p != nil && !p.IsConnected {
			if token, _ := msg.Payload["sessionToken"].(string); token != "" {
				_ = r.hub.sessions.Delete(context.Background(), token)
			}
			if r.Engine.ForfeitTurn(playerID) {
				r.Engine.AppendLog(p.Name + " সময়মতো ফিরে না আসায় চাল বাতিল হয়েছে।")
			}
			r.emit(models.EvPlayerLeft, map[string]any{"playerId": playerID})
			r.emitState()
		}
		return true

	case models.ActRollDice:
		forced, errDice := forcedDiceFrom(msg.Payload)
		if errDice != nil {
			c.sendError("INVALID_DICE", "পাশার মান ১-৬ এর মধ্যে হতে হবে।", msg.RequestID)
			return true
		}
		o, err := r.Engine.RollDiceWithForced(c.playerID, forced)
		if err == nil {
			r.Engine.AutoEndIfNoAction(c.playerID, o)
		}
		r.finishEngineCall(c, msg, o, err)
		return true

	case models.ActBuyProperty:
		tileID, ok := tileIDFrom(msg.Payload)
		if !ok {
			c.sendError("INVALID_TILE", "ঘর নম্বর ভুল।", msg.RequestID)
			return true
		}
		o, err := r.Engine.BuyProperty(c.playerID, tileID)
		if err == nil {
			r.Engine.AutoEndIfNoAction(c.playerID, o)
		}
		r.finishEngineCall(c, msg, o, err)
		return true

	case models.ActBuildHouse:
		tileID, ok := tileIDFrom(msg.Payload)
		if !ok {
			c.sendError("INVALID_TILE", "ঘর নম্বর ভুল।", msg.RequestID)
			return true
		}
		o, err := r.Engine.BuildHouse(c.playerID, tileID)
		if err == nil {
			r.Engine.AutoEndIfNoAction(c.playerID, o)
		}
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

func errBadDice() error { return errors.New("invalid dice") }

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

// forcedDiceFrom extracts optional admin dice from a ROLL_DICE payload.
// Accepts {d1,d2} or {dice:[d1,d2]}. Returns (nil, nil) when no dice were
// supplied (normal random roll), (dice, nil) when valid values were given,
// or (nil, err) when values are present but malformed — the engine then
// validates range + admin rights.
func forcedDiceFrom(payload map[string]any) (*[2]int, error) {
	if payload == nil {
		return nil, nil
	}
	toInt := func(v any) (int, bool) {
		switch n := v.(type) {
		case float64:
			return int(n), true
		case int:
			return n, true
		case int64:
			return int(n), true
		}
		return 0, false
	}
	if raw, ok := payload["dice"]; ok {
		arr, ok := raw.([]any)
		if !ok || len(arr) != 2 {
			return nil, errBadDice()
		}
		a, ok1 := toInt(arr[0])
		b, ok2 := toInt(arr[1])
		if !ok1 || !ok2 {
			return nil, errBadDice()
		}
		return &[2]int{a, b}, nil
	}
	_, hasD1 := payload["d1"]
	_, hasD2 := payload["d2"]
	if !hasD1 && !hasD2 {
		return nil, nil
	}
	a, ok1 := toInt(payload["d1"])
	b, ok2 := toInt(payload["d2"])
	if !ok1 || !ok2 {
		return nil, errBadDice()
	}
	return &[2]int{a, b}, nil
}
