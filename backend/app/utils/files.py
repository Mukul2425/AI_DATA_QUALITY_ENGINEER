import os
import uuid
from fastapi import UploadFile


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def save_upload_file(upload_dir: str, upload_file: UploadFile) -> str:
    ensure_dir(upload_dir)
    ext = os.path.splitext(upload_file.filename or "")[1]
    file_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(upload_dir, file_name)

    with open(file_path, "wb") as out_file:
        while True:
            chunk = upload_file.file.read(1024 * 1024)
            if not chunk:
                break
            out_file.write(chunk)

    return file_path
