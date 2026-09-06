-- Add the active DrAbi teleconsult transport without rewriting applied history.
alter type public.teleconsult_provider add value if not exists 'custom_webrtc';
