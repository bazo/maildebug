package storage

import (
	"encoding/json"
	"fmt"
	"mail-debug/types"

	bolt "go.etcd.io/bbolt"
)

func (s *Storage) SaveMessage(message *types.MailData) error {

	err := s.db.Update(func(tx *bolt.Tx) error {
		bucketID := []byte("mail")
		_, err := tx.CreateBucketIfNotExists(bucketID)
		if err != nil {
			return fmt.Errorf("create bucket: %s", err)
		}

		b := tx.Bucket(bucketID)

		if err != nil {
			return err
		}

		jsonData, err := json.Marshal(message)

		if err != nil {
			return err
		}

		return b.Put([]byte(message.Id), jsonData)
	})

	return err
}
