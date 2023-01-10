package storage

import (
	"encoding/json"
	"fmt"
	"mail-debug/types"
	"strings"

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

		parts := strings.Split(message.MessageId, "@")

		id := parts[0][1 : len(parts[0])-1]

		return b.Put([]byte(id), jsonData)
	})

	return err
}
