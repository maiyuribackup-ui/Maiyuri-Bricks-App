import os
import ftplib
import sys

FTP_HOST = "217.21.87.239"
FTP_USER = "u643284018.app.maiyuri.com"
FTP_PASS = "Priyam@2026"
LOCAL_DIR = "apps/web/.next/standalone"
REMOTE_DIR = "/" # Root of the FTP user usually maps to public_html or app folder

def upload_directory(ftp, local_path, remote_path):
    # Ensure remote directory exists
    try:
        ftp.mkd(remote_path)
    except ftplib.error_perm as e:
        if not str(e).startswith('550'): # 550 means directory already exists
            print(f"Error creating remote dir {remote_path}: {e}")

    # Walk through local directory
    for item in os.listdir(local_path):
        local_item_path = os.path.join(local_path, item)
        remote_item_path = f"{remote_path}/{item}".replace("//", "/")

        if os.path.isdir(local_item_path):
            upload_directory(ftp, local_item_path, remote_item_path)
        else:
            print(f"Uploading {local_item_path} to {remote_item_path}...")
            with open(local_item_path, 'rb') as f:
                ftp.storbinary(f'STOR {remote_item_path}', f)

def main():
    if not os.path.exists(LOCAL_DIR):
        print(f"Error: Local directory {LOCAL_DIR} does not exist. Build failed?")
        sys.exit(1)

    print("Connecting to FTP...")
    ftp = ftplib.FTP(FTP_HOST)
    ftp.login(FTP_USER, FTP_PASS)
    
    print(f"Connected. Current dir: {ftp.pwd()}")
    
    # Check if we are in public_html or if required
    # Just upload to root of FTP user for now
    
    print("Starting upload...")
    upload_directory(ftp, LOCAL_DIR, REMOTE_DIR)
    
    ftp.quit()
    print("Deployment upload complete.")

if __name__ == "__main__":
    main()
