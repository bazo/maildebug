package storage

import (
	"log"
	"maildebug/types"
)

func (s *Storage) SaveMessage(message *types.MailData) error {

	if message.Attachments == nil {
		message.Attachments = []*types.Attachment{}
	}
	log.Println(message)
	return s.db.Save(message)
}
