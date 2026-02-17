
-- Storage bucket for dashboard assets (device images, icons, backgrounds)
INSERT INTO storage.buckets (id, name, public)
VALUES ('dashboard-assets', 'dashboard-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can view assets (public bucket)
CREATE POLICY "Dashboard assets are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'dashboard-assets');

-- Authenticated users can upload assets
CREATE POLICY "Authenticated users can upload dashboard assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'dashboard-assets');

-- Users can update their own uploads
CREATE POLICY "Users can update their own dashboard assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'dashboard-assets' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Users can delete their own uploads
CREATE POLICY "Users can delete their own dashboard assets"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'dashboard-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
