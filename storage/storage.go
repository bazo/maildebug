package storage

import (
	"maildebug/types"
	"os"
	"time"

	"github.com/asdine/storm"
	bolt "go.etcd.io/bbolt"
)

type Storage struct {
	db *storm.DB
}

func NewStorage() *Storage {
	return &Storage{}
}

func (s *Storage) Init(dbName string) error {

	_, err := os.Stat("data")
	if err != nil {
		os.Mkdir("data", os.ModePerm)
	}

	stormDb, err := storm.Open("data/"+dbName, storm.BoltOptions(0600, &bolt.Options{Timeout: 1 * time.Second}))
	if err != nil {
		return err
	}
	s.db = stormDb

	err = stormDb.Init(&types.MailData{})

	/*
		err = db.Bolt.View(func(tx *bolt.Tx) error {
			return tx.ForEach(func(name []byte, _ *bolt.Bucket) error {
				fmt.Println(string(name))
				return nil
			})
		})
	*/
	return err
}

func (s *Storage) Close() {
	s.db.Close()
}
