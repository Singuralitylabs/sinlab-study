-- Optional wide image for the phase list header. NULL falls back to a crop of image_url.
ALTER TABLE learning_themes ADD COLUMN IF NOT EXISTS hero_image_url TEXT;
