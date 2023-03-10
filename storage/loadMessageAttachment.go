package storage

import (
	"maildebug/types"
)

func (s *Storage) LoadMessage(id string) (*types.MailData, error) {
	var message types.MailData
	err := s.db.One("Id", id, &message)

	return &message, err
}
