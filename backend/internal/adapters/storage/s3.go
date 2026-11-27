package storage

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/ravannama/ravannama/backend/internal/domain/media"
)

const emptySHA256Hex = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

var _ media.ObjectStoragePort = (*S3Client)(nil)

// S3Config configures the pure-Go SigV4 S3-compatible object storage adapter.
type S3Config struct {
	InternalEndpoint string
	PublicEndpoint   string
	Region           string
	AccessKey        string
	SecretKey        string
	PublicBucket     string
	PrivateBucket    string
	HTTPClient       *http.Client
	Now              func() time.Time
}

// S3Client implements media.ObjectStoragePort and PutObject using AWS Signature V4.
type S3Client struct {
	internalURL   *url.URL
	publicURL     *url.URL
	region        string
	accessKey     string
	secretKey     string
	publicBucket  string
	privateBucket string
	httpClient    *http.Client
	now           func() time.Time
}

// NewS3Client constructs an S3Client from S3Config.
func NewS3Client(cfg S3Config) (*S3Client, error) {
	internalRaw := strings.TrimSpace(cfg.InternalEndpoint)
	if internalRaw == "" {
		internalRaw = "http://minio:9000"
	}
	internalURL, err := url.Parse(internalRaw)
	if err != nil || internalURL.Host == "" {
		return nil, fmt.Errorf("invalid S3 internal endpoint: %q", internalRaw)
	}

	publicRaw := strings.TrimSpace(cfg.PublicEndpoint)
	if publicRaw == "" {
		publicRaw = internalRaw
	}
	publicURL, err := url.Parse(publicRaw)
	if err != nil || publicURL.Host == "" {
		return nil, fmt.Errorf("invalid S3 public endpoint: %q", publicRaw)
	}

	region := strings.TrimSpace(cfg.Region)
	if region == "" {
		region = "ir-thr-at1"
	}
	publicBucket := strings.TrimSpace(cfg.PublicBucket)
	if publicBucket == "" {
		publicBucket = "ravannama-public"
	}
	privateBucket := strings.TrimSpace(cfg.PrivateBucket)
	if privateBucket == "" {
		privateBucket = "ravannama-private"
	}
	httpClient := cfg.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 15 * time.Second}
	}
	nowFn := cfg.Now
	if nowFn == nil {
		nowFn = func() time.Time { return time.Now().UTC() }
	}

	return &S3Client{
		internalURL:   internalURL,
		publicURL:     publicURL,
		region:        region,
		accessKey:     cfg.AccessKey,
		secretKey:     cfg.SecretKey,
		publicBucket:  publicBucket,
		privateBucket: privateBucket,
		httpClient:    httpClient,
		now:           nowFn,
	}, nil
}

func (c *S3Client) bucketName(kind media.BucketKind) (string, error) {
	switch kind {
	case media.BucketPublic:
		return c.publicBucket, nil
	case media.BucketPrivate:
		return c.privateBucket, nil
	default:
		return "", fmt.Errorf("unknown bucket kind: %q", kind)
	}
}

// PresignPut generates a query-presigned SigV4 PUT URL using PublicEndpoint.
// Signs strictly `content-type` and `host` (never `content-length`) with `UNSIGNED-PAYLOAD`.
func (c *S3Client) PresignPut(_ context.Context, bucket media.BucketKind, key string, mimeType media.AllowedMIMEType, _ int64, ttl time.Duration) (string, error) {
	if ttl <= 0 {
		return "", fmt.Errorf("presign put ttl must be positive")
	}
	bName, err := c.bucketName(bucket)
	if err != nil {
		return "", err
	}
	now := c.now().UTC()
	expSec := int64(ttl.Seconds())
	if expSec < 1 {
		expSec = 1
	}

	canonURI := buildCanonicalURI(c.publicURL.Path, bName, key)
	headers := []kv{
		{k: "content-type", v: string(mimeType)},
		{k: "host", v: c.publicURL.Host},
	}
	queryParams := []kv{
		{k: "X-Amz-Algorithm", v: "AWS4-HMAC-SHA256"},
		{k: "X-Amz-Credential", v: fmt.Sprintf("%s/%s/%s/s3/aws4_request", c.accessKey, now.Format("20060102"), c.region)},
		{k: "X-Amz-Date", v: now.Format("20060102T150405Z")},
		{k: "X-Amz-Expires", v: strconv.FormatInt(expSec, 10)},
		{k: "X-Amz-SignedHeaders", v: "content-type;host"},
	}

	return c.buildPresignedURL("PUT", c.publicURL, canonURI, queryParams, headers, now), nil
}

// PresignGet generates a query-presigned SigV4 GET URL (max 60s TTL) with attachment disposition.
func (c *S3Client) PresignGet(_ context.Context, bucket media.BucketKind, key string, ttl time.Duration) (string, error) {
	if ttl <= 0 || ttl > 60*time.Second {
		return "", media.ErrInvalidDownloadTTL
	}
	bName, err := c.bucketName(bucket)
	if err != nil {
		return "", err
	}
	now := c.now().UTC()
	expSec := int64(ttl.Seconds())
	if expSec < 1 {
		expSec = 1
	}

	canonURI := buildCanonicalURI(c.publicURL.Path, bName, key)
	headers := []kv{
		{k: "host", v: c.publicURL.Host},
	}
	queryParams := []kv{
		{k: "X-Amz-Algorithm", v: "AWS4-HMAC-SHA256"},
		{k: "X-Amz-Credential", v: fmt.Sprintf("%s/%s/%s/s3/aws4_request", c.accessKey, now.Format("20060102"), c.region)},
		{k: "X-Amz-Date", v: now.Format("20060102T150405Z")},
		{k: "X-Amz-Expires", v: strconv.FormatInt(expSec, 10)},
		{k: "X-Amz-SignedHeaders", v: "host"},
		{k: "response-content-disposition", v: "attachment"},
	}

	return c.buildPresignedURL("GET", c.publicURL, canonURI, queryParams, headers, now), nil
}

// HeadObject checks object metadata on InternalEndpoint.
func (c *S3Client) HeadObject(ctx context.Context, bucket media.BucketKind, key string) (*media.ObjectMetadata, error) {
	req, err := c.newSignedRequest(ctx, http.MethodHead, bucket, key, nil, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("s3 head object failed with status %d", resp.StatusCode)
	}
	return &media.ObjectMetadata{
		ContentLength: resp.ContentLength,
		ContentType:   resp.Header.Get("Content-Type"),
		ETag:          strings.Trim(resp.Header.Get("ETag"), `"`),
	}, nil
}

// GetObjectRange fetches bytes [startByte, endByte] inclusive from InternalEndpoint.
func (c *S3Client) GetObjectRange(ctx context.Context, bucket media.BucketKind, key string, startByte int64, endByte int64) ([]byte, error) {
	if startByte < 0 || endByte < startByte {
		return nil, fmt.Errorf("invalid byte range %d-%d", startByte, endByte)
	}
	extra := map[string]string{
		"range": fmt.Sprintf("bytes=%d-%d", startByte, endByte),
	}
	req, err := c.newSignedRequest(ctx, http.MethodGet, bucket, key, nil, extra)
	if err != nil {
		return nil, err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusPartialContent && resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("s3 get range failed with status %d", resp.StatusCode)
	}
	// Cap read to requested range length + 1 MiB safety bound.
	maxRead := (endByte - startByte + 1) + 1024
	if resp.StatusCode == http.StatusOK {
		maxRead = endByte + 1024
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxRead))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode == http.StatusOK {
		if startByte >= int64(len(data)) {
			return nil, nil
		}
		end := endByte + 1
		if end > int64(len(data)) {
			end = int64(len(data))
		}
		return data[startByte:end], nil
	}
	return data, nil
}

// DeleteObject removes an object from InternalEndpoint.
func (c *S3Client) DeleteObject(ctx context.Context, bucket media.BucketKind, key string) error {
	req, err := c.newSignedRequest(ctx, http.MethodDelete, bucket, key, nil, nil)
	if err != nil {
		return err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNotFound {
		return fmt.Errorf("s3 delete object failed with status %d", resp.StatusCode)
	}
	return nil
}

// PutObject uploads an object directly to InternalEndpoint (used by seeding and tests).
func (c *S3Client) PutObject(ctx context.Context, bucket media.BucketKind, key string, mimeType media.AllowedMIMEType, data []byte) error {
	extra := map[string]string{
		"content-type": string(mimeType),
	}
	req, err := c.newSignedRequest(ctx, http.MethodPut, bucket, key, data, extra)
	if err != nil {
		return err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusNoContent {
		return fmt.Errorf("s3 put object failed with status %d", resp.StatusCode)
	}
	return nil
}

type kv struct {
	k string
	v string
}

func (c *S3Client) buildPresignedURL(method string, base *url.URL, canonURI string, queryParams []kv, signedHeaders []kv, now time.Time) string {
	sort.Slice(queryParams, func(i, j int) bool {
		if queryParams[i].k == queryParams[j].k {
			return queryParams[i].v < queryParams[j].v
		}
		return queryParams[i].k < queryParams[j].k
	})
	sort.Slice(signedHeaders, func(i, j int) bool {
		return signedHeaders[i].k < signedHeaders[j].k
	})

	canonQuery := encodeCanonicalQuery(queryParams)
	var canonHeadersBuf strings.Builder
	var headerNames []string
	for _, h := range signedHeaders {
		canonHeadersBuf.WriteString(h.k)
		canonHeadersBuf.WriteByte(':')
		canonHeadersBuf.WriteString(strings.TrimSpace(h.v))
		canonHeadersBuf.WriteByte('\n')
		headerNames = append(headerNames, h.k)
	}
	signedHeaderList := strings.Join(headerNames, ";")

	canonRequest := strings.Join([]string{
		method,
		canonURI,
		canonQuery,
		canonHeadersBuf.String(),
		signedHeaderList,
		"UNSIGNED-PAYLOAD",
	}, "\n")

	dateStamp := now.Format("20060102")
	amzDate := now.Format("20060102T150405Z")
	scope := fmt.Sprintf("%s/%s/s3/aws4_request", dateStamp, c.region)
	stringToSign := strings.Join([]string{
		"AWS4-HMAC-SHA256",
		amzDate,
		scope,
		sha256HexBytes([]byte(canonRequest)),
	}, "\n")

	sigKey := deriveSigningKey(c.secretKey, dateStamp, c.region, "s3")
	signature := hex.EncodeToString(hmacSHA256(sigKey, []byte(stringToSign)))

	return fmt.Sprintf("%s://%s%s?%s&X-Amz-Signature=%s", base.Scheme, base.Host, canonURI, canonQuery, signature)
}

func (c *S3Client) newSignedRequest(ctx context.Context, method string, bucket media.BucketKind, key string, body []byte, extraHeaders map[string]string) (*http.Request, error) {
	bName, err := c.bucketName(bucket)
	if err != nil {
		return nil, err
	}
	now := c.now().UTC()
	dateStamp := now.Format("20060102")
	amzDate := now.Format("20060102T150405Z")

	payloadHash := emptySHA256Hex
	if len(body) > 0 {
		payloadHash = sha256HexBytes(body)
	}

	canonURI := buildCanonicalURI(c.internalURL.Path, bName, key)
	targetURL := fmt.Sprintf("%s://%s%s", c.internalURL.Scheme, c.internalURL.Host, canonURI)

	var bodyReader io.Reader
	if body != nil {
		bodyReader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, targetURL, bodyReader)
	if err != nil {
		return nil, err
	}
	if body != nil {
		req.ContentLength = int64(len(body))
	}

	headerList := []kv{
		{k: "host", v: c.internalURL.Host},
		{k: "x-amz-content-sha256", v: payloadHash},
		{k: "x-amz-date", v: amzDate},
	}
	req.Host = c.internalURL.Host
	req.Header.Set("X-Amz-Content-Sha256", payloadHash)
	req.Header.Set("X-Amz-Date", amzDate)

	for k, v := range extraHeaders {
		lk := strings.ToLower(strings.TrimSpace(k))
		headerList = append(headerList, kv{k: lk, v: v})
		req.Header.Set(k, v)
	}

	sort.Slice(headerList, func(i, j int) bool {
		return headerList[i].k < headerList[j].k
	})

	var canonHeadersBuf strings.Builder
	var signedNames []string
	for _, h := range headerList {
		canonHeadersBuf.WriteString(h.k)
		canonHeadersBuf.WriteByte(':')
		canonHeadersBuf.WriteString(strings.TrimSpace(h.v))
		canonHeadersBuf.WriteByte('\n')
		signedNames = append(signedNames, h.k)
	}
	signedHeadersStr := strings.Join(signedNames, ";")

	canonRequest := strings.Join([]string{
		method,
		canonURI,
		"",
		canonHeadersBuf.String(),
		signedHeadersStr,
		payloadHash,
	}, "\n")

	scope := fmt.Sprintf("%s/%s/s3/aws4_request", dateStamp, c.region)
	stringToSign := strings.Join([]string{
		"AWS4-HMAC-SHA256",
		amzDate,
		scope,
		sha256HexBytes([]byte(canonRequest)),
	}, "\n")

	sigKey := deriveSigningKey(c.secretKey, dateStamp, c.region, "s3")
	signature := hex.EncodeToString(hmacSHA256(sigKey, []byte(stringToSign)))

	authHeader := fmt.Sprintf("AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		c.accessKey, scope, signedHeadersStr, signature)
	req.Header.Set("Authorization", authHeader)

	return req, nil
}

func buildCanonicalURI(basePath, bucketName, key string) string {
	trimmedBase := strings.Trim(basePath, "/")
	trimmedKey := strings.TrimLeft(key, "/")
	parts := make([]string, 0, 4)
	if trimmedBase != "" {
		for _, seg := range strings.Split(trimmedBase, "/") {
			if seg != "" {
				parts = append(parts, awsURIEncode(seg, true))
			}
		}
	}
	parts = append(parts, awsURIEncode(bucketName, true))
	for _, seg := range strings.Split(trimmedKey, "/") {
		parts = append(parts, awsURIEncode(seg, true))
	}
	return "/" + strings.Join(parts, "/")
}

func encodeCanonicalQuery(params []kv) string {
	parts := make([]string, len(params))
	for i, p := range params {
		parts[i] = awsURIEncode(p.k, true) + "=" + awsURIEncode(p.v, true)
	}
	return strings.Join(parts, "&")
}

func awsURIEncode(s string, encodeSlash bool) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		isUnreserved := (c >= 'A' && c <= 'Z') ||
			(c >= 'a' && c <= 'z') ||
			(c >= '0' && c <= '9') ||
			c == '-' || c == '_' || c == '.' || c == '~'
		if isUnreserved || (c == '/' && !encodeSlash) {
			b.WriteByte(c)
		} else {
			fmt.Fprintf(&b, "%%%02X", c)
		}
	}
	return b.String()
}

func deriveSigningKey(secret, dateStamp, region, service string) []byte {
	kDate := hmacSHA256([]byte("AWS4"+secret), []byte(dateStamp))
	kRegion := hmacSHA256(kDate, []byte(region))
	kService := hmacSHA256(kRegion, []byte(service))
	return hmacSHA256(kService, []byte("aws4_request"))
}

func hmacSHA256(key, data []byte) []byte {
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write(data)
	return mac.Sum(nil)
}

func sha256HexBytes(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}
