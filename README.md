Project Deployed on : https://keydrop-8x2m.onrender.com/

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and fill in MongoDB, encryption, and AWS values.
3. Create a private S3 bucket in the same AWS region as `AWS_REGION`.
4. Give the server's AWS user only these permissions for that bucket: `s3:PutObject`, `s3:GetObject`, and `s3:DeleteObject`.
5. Start the server with `npm run dev`.

Files are encrypted by the application before they are uploaded to S3. The bucket should remain private; downloads continue through `/api/download/:code`, where the server decrypts the object before returning it.

The current upload route keeps the file in memory and accepts files up to 500 MB. For the UI, the intended limit remains 50 MB.

Features:

1. Auto Data Delete in 1 hr
2. User can send any type of file upto 50Mb
3. User too can delete file from database if he wants.
4. Concurrency availabe upto 500 users
