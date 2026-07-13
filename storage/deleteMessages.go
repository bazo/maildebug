package storage

import (
	"maildebug/types"
	"os"
)

func (s *Storage) DeleteMessages() error {
	if err := s.db.Drop(&types.MailData{}); err != nil {
		return err
	}
	if err := os.RemoveAll("data/messages"); err != nil {
		return err
	}
	return os.MkdirAll("data/messages", 0755)
}

// DeleteMessage removes a single message by id from the store and deletes its
// on-disk raw copy. A missing raw file is not an error (the record is the
// source of truth for existence).
func (s *Storage) DeleteMessage(id string) error {
	message, err := s.LoadMessage(id)
	if err != nil {
		return err
	}
	if err := s.db.DeleteStruct(message); err != nil {
		return err
	}
	if err := os.Remove("data/messages/" + id); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}
