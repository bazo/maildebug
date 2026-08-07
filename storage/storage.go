package storage

import (
	"maildebug/types"
	"os"
	"time"

	"github.com/asdine/storm"
	bolt "go.etcd.io/bbolt"
)

// orderField is the field every listing sorts on: `Id`, which is
// `<UnixNano>-<random hex>` — capture order, and lexicographically sortable
// because the nanosecond part is a fixed 19 digits (through year 2262).
//
// NOT `Date`. storm's OrderBy has no case for time.Time, so it falls through to
// comparing `codec.Marshal(value)` — for the default JSON codec, the *RFC 3339
// text*, byte by byte. That compares clock faces and ignores the zone offset
// entirely: a message stamped `11:55:00Z` sorts below one stamped
// `12:21:00+02:00` even though it is 26 minutes newer. Senders overwhelmingly
// stamp `Date` in UTC (nodemailer always does) while maildebug's fallback for
// an unparseable header is the local clock, so a mailbox mixing the two
// interleaved by exactly the UTC offset. Ordering on capture time also stops
// trusting a header the sender controls — a wrong clock upstream can no longer
// bury a message mid-list.
const orderField = "Id"

type Storage struct {
	db *storm.DB
}

func NewStorage() *Storage {
	return &Storage{}
}

func (s *Storage) Init(dbName string) error {

	if err := os.MkdirAll("data/messages", 0755); err != nil {
		return err
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
	if s.db != nil {
		s.db.Close()
	}
}
