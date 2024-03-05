package storage

import (
	"maildebug/types"
)

func (s *Storage) DeleteMessages() error {

	return s.db.Drop(&types.MailData{})

}
