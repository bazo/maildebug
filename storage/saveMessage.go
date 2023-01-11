package storage

import (
	"maildebug/types"
)

func (s *Storage) SaveMessage(message *types.MailData) error {
	return s.db.Save(message)
}
