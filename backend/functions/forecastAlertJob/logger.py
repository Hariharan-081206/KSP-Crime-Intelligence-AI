
from datetime import datetime

def info(message):
    print(f"[INFO] {datetime.now()} : {message}")

def warning(message):
    print(f"[WARNING] {datetime.now()} : {message}")

def error(message):
    print(f"[ERROR] {datetime.now()} : {message}")


