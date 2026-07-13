package storage

import "maildebug/types"

// MarkRead flags a message as read. Returns storm.ErrNotFound if the id is
// unknown.
func (s *Storage) MarkRead(id string) error {
	message, err := s.LoadMessage(id)
	if err != nil {
		return err
	}
	if message.Read {
		return nil
	}
	message.Read = true
	return s.db.Update(message)
}

// UnreadCount returns the number of messages not yet marked read.
func (s *Storage) UnreadCount() (int, error) {
	count := 0
	err := s.db.Select().Each(new(types.MailData), func(record interface{}) error {
		if !record.(*types.MailData).Read {
			count++
		}
		return nil
	})
	return count, err
}
