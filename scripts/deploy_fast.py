import os
import ftplib
import sys

FTP_HOST = "217.21.87.239"
FTP_USER = "u643284018.app.maiyuri.com"
FTP_PASS = "Priyam@2026"
REMOTE_DIR = "/" 

def upload_file(ftp, local_path):
    filename = os.path.basename(local_path)
    print(f"Uploading {filename}...")
    with open(local_path, 'rb') as f:
        ftp.storbinary(f'STOR {filename}', f)

def main():
    print("Connecting to FTP...")
    ftp = ftplib.FTP(FTP_HOST)
    ftp.login(FTP_USER, FTP_PASS)
    
    print(f"Connected. Current dir: {ftp.pwd()}")
    
    upload_file(ftp, "deploy.zip")
    upload_file(ftp, "unzip.php")
    upload_file(ftp, "setup.php")
    upload_file(ftp, "flatten.php")
    
    ftp.quit()
    print("Files uploaded.")

if __name__ == "__main__":
    main()
