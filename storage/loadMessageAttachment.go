package storage

import (
	"maildebug/types"
)

func (s *Storage) LoadMessage(id string) (*types.MailData, error) {
	var message types.MailData
	if err := s.db.One("Id", id, &message); err != nil {
		return nil, err
	}
	return &message, nil
}
