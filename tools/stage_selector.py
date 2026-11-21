"""Print the stage-index byte table from the verified European ROM."""
from pathlib import Path
import argparse, hashlib

EXPECTED = "2b1ca521975c3010650fd2055be8c6b964ea4eff765ad03198ac71995285fee7"

def lorom(bank, addr):
    if not 0x8000 <= addr <= 0xFFFF:
        raise ValueError(f"Not a LoROM address: {bank:02X}:{addr:04X}")
    return bank * 0x8000 + (addr & 0x7FFF)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rom", required=True, type=Path, help="headerless Super Probotector (E) ROM")
    rom = ap.parse_args().rom.read_bytes()
    if len(rom) == 0x100200:
        rom = rom[512:]
    digest = hashlib.sha256(rom).hexdigest()
    if digest != EXPECTED:
        raise SystemExit(f"Wrong ROM revision/length: SHA-256 {digest}")
    start = lorom(5, 0x89E5)
    table = rom[start:start + 7]
    print(f"ROM SHA-256: {digest}")
    print(f"Stage-index table: $05:89E5 (file offset ${start:05X})")
    for stage in range(1, 7):
        print(f"stage {stage}: index ${table[stage]:02X}")

if __name__ == "__main__":
    main()
