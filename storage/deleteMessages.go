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
