package storage

import (
	"maildebug/types"
)

func (s *Storage) SaveMessage(message *types.MailData) error {

	if message.Attachments == nil {
		message.Attachments = []*types.Attachment{}
	}

	return s.db.Save(message)
}
