-- name: ListPublishedBlogPostsByTherapist :many
SELECT id, therapist_id, slug, title, excerpt, body_markdown, cover_object_key,
       seo_title, seo_description, reading_min, status, published_at,
       created_at, updated_at
FROM content.blog_posts
WHERE therapist_id = $1 AND status = 'published'
ORDER BY published_at DESC NULLS LAST, created_at DESC;

-- name: ListAllBlogPostsByTherapist :many
SELECT id, therapist_id, slug, title, excerpt, body_markdown, cover_object_key,
       seo_title, seo_description, reading_min, status, published_at,
       created_at, updated_at
FROM content.blog_posts
WHERE therapist_id = $1
ORDER BY updated_at DESC, created_at DESC;

-- name: GetBlogPostByID :one
SELECT id, therapist_id, slug, title, excerpt, body_markdown, cover_object_key,
       seo_title, seo_description, reading_min, status, published_at,
       created_at, updated_at
FROM content.blog_posts
WHERE id = $1;

-- name: GetPublishedBlogPostBySlug :one
SELECT id, therapist_id, slug, title, excerpt, body_markdown, cover_object_key,
       seo_title, seo_description, reading_min, status, published_at,
       created_at, updated_at
FROM content.blog_posts
WHERE therapist_id = $1 AND slug = $2 AND status = 'published';

-- name: UpsertBlogPost :one
INSERT INTO content.blog_posts (
    id, therapist_id, slug, title, excerpt, body_markdown, cover_object_key,
    seo_title, seo_description, reading_min, status, published_at,
    created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7,
    $8, $9, $10, $11, $12,
    $13, $14
)
ON CONFLICT (id) DO UPDATE
SET slug = EXCLUDED.slug,
    title = EXCLUDED.title,
    excerpt = EXCLUDED.excerpt,
    body_markdown = EXCLUDED.body_markdown,
    cover_object_key = EXCLUDED.cover_object_key,
    seo_title = EXCLUDED.seo_title,
    seo_description = EXCLUDED.seo_description,
    reading_min = EXCLUDED.reading_min,
    status = EXCLUDED.status,
    published_at = EXCLUDED.published_at,
    updated_at = EXCLUDED.updated_at
WHERE content.blog_posts.therapist_id = EXCLUDED.therapist_id
RETURNING id, therapist_id, slug, title, excerpt, body_markdown, cover_object_key,
          seo_title, seo_description, reading_min, status, published_at,
          created_at, updated_at;

-- name: GetReviewByBookingID :one
SELECT id, booking_id, therapist_id, client_label, rating, comment, is_published, created_at
FROM content.reviews
WHERE booking_id = $1;

-- name: CreateReview :one
INSERT INTO content.reviews (
    id, booking_id, therapist_id, client_label, rating, comment, is_published, created_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8
)
RETURNING id, booking_id, therapist_id, client_label, rating, comment, is_published, created_at;

-- name: ListPublishedReviewsByTherapist :many
SELECT id, booking_id, therapist_id, client_label, rating, comment, is_published, created_at
FROM content.reviews
WHERE therapist_id = $1 AND is_published = true
ORDER BY created_at DESC;
