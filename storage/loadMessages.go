package storage

import (
	"encoding/json"
	"mail-debug/types"

	bolt "go.etcd.io/bbolt"
)

func (s *Storage) LoadMessages(page int64, limit int64) ([]*types.MailData, int64, error) {
	var total int64 = 0
	messages := make([]*types.MailData, 0)
	err := s.stormDb.Bolt.View(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte("mail"))

		if b == nil {
			return nil
		}

		b.ForEach(func(k, v []byte) error {
			total++
			return nil
		})

		return nil
	})

	if err != nil {
		return messages, total, err
	}

	if err == nil {
		skip := (page - 1) * limit

		query := s.stormDb.Select().Limit(int(limit)).Skip(int(skip)).OrderBy("Date").Reverse()
		query.Bucket("mail")

		query.RawEach(func(k, v []byte) error {
			req := &types.MailData{}
			json.Unmarshal(v, req)
			messages = append(messages, req)
			return nil
		})
	}

	return messages, total, err
}
