-- Add logo_url to companies table
ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url text;

-- Create logos storage bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to logos
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'logos' );

-- Allow authenticated users to upload logos
CREATE POLICY "Auth Users Upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'logos' );

-- Allow authenticated users to update their uploaded logos
CREATE POLICY "Auth Users Update"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'logos' );

-- Allow authenticated users to delete their uploaded logos
CREATE POLICY "Auth Users Delete"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'logos' );
