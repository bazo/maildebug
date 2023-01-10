package storage

import (
	"fmt"
	"time"

	"github.com/asdine/storm"
	bolt "go.etcd.io/bbolt"
)

type Storage struct {
	db      *bolt.DB
	stormDb *storm.DB
}

func NewStorage() *Storage {
	return &Storage{}
}

func (s *Storage) Init(dbName string) error {
	stormDb, err := storm.Open(dbName, storm.BoltOptions(0600, &bolt.Options{Timeout: 1 * time.Second}))
	if err != nil {
		return err
	}

	db := stormDb.Bolt

	s.db = db
	s.stormDb = stormDb
	err = db.Update(func(tx *bolt.Tx) error {
		_, err := tx.CreateBucketIfNotExists([]byte("mail"))
		if err != nil {
			return fmt.Errorf("create bucket: %s", err)
		}
		return nil
	})

	if err != nil {
		return err
	}

	return nil
}

func (s *Storage) Close() {
	s.stormDb.Close()
}
