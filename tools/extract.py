"""Reproducible extraction from the user's headerless European ROM.

The decompressor is translated from $00:9474-$00:95FE in this exact ROM.
No emulator is used by this extractor or by the web application.
"""
from pathlib import Path
import argparse, hashlib, json, struct, wave
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = '2b1ca521975c3010650fd2055be8c6b964ea4eff765ad03198ac71995285fee7'

def offset(address):
    if address & 0xffff < 0x8000 or address >> 16 in (0x7e, 0x7f):
        raise ValueError(f'Not a LoROM address: {address:06x}')
    return ((address >> 16) & 0x1f) * 0x8000 + (address & 0x7fff)

def decompress(rom, address):
    p = offset(address)
    size = int.from_bytes(rom[p:p+2], 'little')
    if size < 2 or p + size > len(rom):
        raise ValueError('Invalid compressed input size')
    data = rom[p:p+size]
    ring = bytearray(0x400)
    out = bytearray()
    i = 2
    def read():
        nonlocal i
        if i >= len(data): raise ValueError('Truncated command')
        b = data[i]; i += 1; return b
    def put(b):
        ring[len(out) & 0x3ff] = b
        out.append(b)
        if len(out) > 0x100000: raise ValueError('Output limit')
    while i < size:
        command = read()
        if command < 0x80:
            # Absolute ring index with bias, NOT a relative LZ distance.
            source = (((command << 8) | read()) - 0x3df) & 0x3ff
            for _ in range((command >> 2) + 2):
                put(ring[source]); source = (source + 1) & 0x3ff
        elif command < 0xa0:
            for _ in range(command & 31): put(read())
        elif command < 0xc0:
            for _ in range((command & 31) + 2): put(0); put(read())
        elif command < 0xe0:
            b = read()
            for _ in range((command & 31) + 2): put(b)
        else:
            for _ in range((command & 31) + 2): put(0)
    return bytes(out), size

def tile_image(data, bpp=4, palette=None, columns=32):
    size = bpp * 8
    n = len(data)//size
    im = Image.new('RGBA', (columns*8, max(1,(n+columns-1)//columns)*8))
    for t in range(n):
        for y in range(8):
            for x in range(8):
                v = sum(((data[t*size+(bit//2)*16+y*2+(bit&1)] >> (7-x))&1)<<bit for bit in range(bpp))
                color = palette[v] if palette else (v*255//((1<<bpp)-1),)*3+(255,)
                im.putpixel(((t%columns)*8+x,(t//columns)*8+y),color)
    return im

def decode_brr(data, start, max_blocks=8192):
    """Decode BRR to signed 16-bit PCM; preserve loop metadata separately."""
    samples=[]; older=old=0; p=start; blocks=[]
    for _ in range(max_blocks):
        if p+9>len(data):raise ValueError('BRR outside ARAM')
        head=data[p];shift=head>>4;filt=(head>>2)&3;blocks.append(data[p:p+9])
        for packed in data[p+1:p+9]:
            for nibble in (packed>>4,packed&15):
                signed=nibble-16 if nibble&8 else nibble
                s=(signed<<shift)>>1 if shift<=12 else (-2048 if signed<0 else 0)
                if filt==1:s+=old+((-old)>>4)
                elif filt==2:s+=2*old+((-3*old)>>5)-older+(older>>4)
                elif filt==3:s+=2*old+((-13*old)>>6)-older+((3*older)>>4)
                s=max(-32768,min(32767,s)) & 0x7fff
                s=s-0x8000 if s&0x4000 else s
                older,old=old,s;samples.append(s*2)
        p+=9
        if head&1:return samples,b''.join(blocks),bool(head&2)
    raise ValueError('Unterminated BRR')

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--rom',type=Path,required=True);ap.add_argument('--captures',type=Path,required=True);args=ap.parse_args()
    rom=args.rom.read_bytes()
    if len(rom)%0x8000==512:rom=rom[512:]
    assert hashlib.sha256(rom).hexdigest()==EXPECTED,'Wrong ROM revision'
    dst=ROOT/'web/assets';dst.mkdir(parents=True,exist_ok=True)
    manifest={'romSha256':EXPECTED,'graphicsCompressionRoutine':'00:9474-00:95FE','streams':[],'audio':[]}
    streams=json.loads((args.captures/'streams.json').read_text())
    (dst/'streams').mkdir(exist_ok=True)
    for stream in streams:
        ptr=stream['ptr'];out,size=decompress(rom,ptr);reference=bytes(stream['output'])
        # Some captures end with a currently unfinished stream. Verify only the observed prefix.
        assert out[:len(reference)]==reference,f'Decompression mismatch {ptr:06x}: {len(out)} / {len(reference)}'
        name=f'{ptr:06x}'
        (dst/'streams'/f'{name}.bin').write_bytes(out)
        tile_image(out).save(dst/'streams'/f'{name}-4bpp.png')
        manifest['streams'].append({'address':f'{ptr:06X}','romOffset':offset(ptr),'compressedBytes':size,'decodedBytes':len(out),'referenceBytesCompared':len(reference),'sha256':hashlib.sha256(out).hexdigest(),'firstObservedFrame':stream['frame']})
    for name in ['stage1-entry','level-loaded']:
        cap=args.captures/name
        if not cap.exists():continue
        aram=(cap/'aram.bin').read_bytes();dsp=json.loads((cap/'dsp.json').read_text());base=dsp['dirPage']<<8
        audio=dst/'audio'/name;audio.mkdir(parents=True,exist_ok=True)
        used=set(dsp['srcn'])
        # Directory entries are scanned conservatively and only accepted with valid terminating BRR.
        entries=[]
        for n in range(256):
            start,loop=struct.unpack_from('<HH',aram,(base+n*4)&0xffff)
            if start<base+0x100 or start>=0xffc0 or loop<start or loop>=0xffc0:continue
            try:pcm,brr,looped=decode_brr(aram,start)
            except ValueError:continue
            if len(brr)<18 or len(brr)>0x8000:continue
            # A loop pointer must address a block inside this sample.
            if looped and (loop-start>=len(brr) or (loop-start)%9):continue
            (audio/f'{n:03}.brr').write_bytes(brr)
            with wave.open(str(audio/f'{n:03}.wav'),'wb') as w:
                w.setnchannels(1);w.setsampwidth(2);w.setframerate(32000);w.writeframes(struct.pack('<'+'h'*len(pcm),*pcm))
            entries.append({'id':n,'aramStart':start,'aramLoop':loop,'looped':looped,'blocks':len(brr)//9,'observedOnVoice':n in used})
        manifest['audio'].append({'capture':name,'directory':base,'entries':entries,'status':'candidate sample extraction; songs and playback pitches not reconstructed'})
    (dst/'manifest.json').write_text(json.dumps(manifest,indent=2))
    print(f"Decoded {len(streams)} streams; verified {sum(s['referenceBytesCompared'] for s in manifest['streams'])} bytes against reference RAM.")
    print('Audio candidates:',[(a['capture'],len(a['entries'])) for a in manifest['audio']])

if __name__=='__main__':main()
