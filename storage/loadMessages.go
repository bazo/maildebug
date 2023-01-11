package storage

import (
	"mail-debug/types"

	bolt "go.etcd.io/bbolt"
)

func (s *Storage) LoadMessages(page int64, limit int64) ([]*types.MailData, int64, error) {
	var total int64 = 0
	messages := make([]*types.MailData, 0)

	err := s.db.Bolt.View(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte("MailData"))

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

	skip := (page - 1) * limit

	//err = s.db.AllByIndex("Date", &messages, storm.Limit(int(limit)), storm.Skip(int(skip)), storm.Reverse())

	query := s.db.Select().Limit(int(limit)).Skip(int(skip)).Reverse().OrderBy("Date")

	err = query.Each(new(types.MailData), func(record interface{}) error {
		message := record.(*types.MailData)

		for _, att := range message.Attachments {
			att.Data = ""
		}

		messages = append(messages, message)

		return nil
	})

	return messages, total, err
}
