package media

import "errors"

var (
	ErrInvalidInput       = errors.New("media: invalid input")
	ErrUnsupportedMIME    = errors.New("media: unsupported mime type")
	ErrFileTooLarge       = errors.New("media: file size exceeds 5 MiB limit")
	ErrNoActiveHold       = errors.New("media: no active held booking found for caller")
	ErrMediaNotFound      = errors.New("media: media object not found")
	ErrMediaDeleted       = errors.New("media: media object has been deleted")
	ErrForbidden          = errors.New("media: forbidden")
	ErrInvalidReceiptFile = errors.New("media: uploaded object failed magic-byte or size validation")
	ErrInvalidDownloadTTL = errors.New("media: download url ttl must be between 1s and 60s")
)
