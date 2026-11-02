"""Kernel-held single-instance lease; releases automatically when Node exits."""
import fcntl
import os
from pathlib import Path
import stat
import sys


def main():
    directory = Path(sys.argv[1])
    info = directory.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        return 73
    fd = os.open(directory / "service.lease", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            return 73
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return 73
        sys.stdout.write("locked\n")
        sys.stdout.flush()
        while sys.stdin.buffer.read(4096):
            pass
        return 0
    finally:
        os.close(fd)


if __name__ == "__main__":
    sys.exit(main())
