"""Build native Canvas assets from decoded ROM structures, not screenshots."""
from pathlib import Path
import json, struct
from PIL import Image
from extract import ROOT, decompress, offset, EXPECTED

def word(b,p):return b[p]|b[p+1]<<8
def signed(b):return b-256 if b&128 else b
def palette(b):
    return [((v&31)*255//31,((v>>5)&31)*255//31,((v>>10)&31)*255//31,255) for v in struct.unpack('<'+'H'*(len(b)//2),b)]
def tile(data,n,pal,bpp=4):
    im=Image.new('RGBA',(8,8));base=n*bpp*8
    if base+bpp*8>len(data):return im
    for y in range(8):
        for x in range(8):
            v=sum(((data[base+bit//2*16+y*2+(bit&1)]>>(7-x))&1)<<bit for bit in range(bpp))
            if v:im.putpixel((x,y),pal[v])
    return im

def draw_tile(out,data,entry,x,y,pals,bpp=4):
    t=tile(data,entry&1023,pals[(entry>>10)&7],bpp)
    if entry&0x4000:t=t.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if entry&0x8000:t=t.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    out.alpha_composite(t,(x,y))

def map_pages(mapdata,metas,tiles,pals):
    pages=len(mapdata)//128
    out=Image.new('RGBA',(pages*256,256))
    for page in range(pages):
        for my in range(8):
            for mx in range(8):
                m=word(mapdata,page*128+my*16+mx*2)
                flip=m&0xc000;base=m&0x3fff
                for ty in range(4):
                    for tx in range(4):
                        sx=3-tx if flip&0x4000 else tx;sy=3-ty if flip&0x8000 else ty
                        at=base+sy*8+sx*2
                        if at+1<len(metas):draw_tile(out,tiles,word(metas,at)^flip,page*256+mx*32+tx*8,my*32+ty*8,pals)
    return out

def captured_background(cap,rom):
    p=json.loads((cap/'ppu.json').read_text());v=(cap/'vram.bin').read_bytes();c=palette((cap/'cgram.bin').read_bytes());out=Image.new('RGBA',(256,224),c[0]);pals=[c[i:i+16] for i in range(0,128,16)]
    for priority in (0,1):
        for layer in (1,0,2):
            if not p['mainScreenEnabled'][layer]:continue
            bpp=2 if layer==2 else 4
            for y in range(224):
                yy=(y+1+p['bgVoff'][layer])&255
                for x in range(256):
                    xx=(x+p['bgHoff'][layer])&511
                    at=(p['tilemapAdr'][layer]*2+((yy//8)*32+(xx//8)%32)*2+((xx//256)*2048 if p['tilemapWider'][layer] else 0))&65535
                    e=word(v,at)
                    if bool(e&0x2000)!=bool(priority):continue
                    pix=tile(v[p['tileAdr'][layer]*2:],e&1023,pals[(e>>10)&7],bpp)
                    px=7-xx%8 if e&0x4000 else xx%8;py=7-yy%8 if e&0x8000 else yy%8
                    color=pix.getpixel((px,py))
                    if color[3]:out.putpixel((x,y),color)
    return out

def build_mode7_assets(capture, assets):
    """Decode Stage 2 Mode 7 tilemap/pixels and the OAM start markers."""
    ppu=json.loads((capture/'ppu.json').read_text());vram=(capture/'vram.bin').read_bytes();cgram=(capture/'cgram.bin').read_bytes();colors=palette(cgram)
    world=Image.new('RGBA',(1024,1024),colors[0])
    # Mode 7 uses 128x128 byte tile IDs, then 256 8bpp 8x8 tiles.
    for ty in range(128):
        for tx in range(128):
            t=vram[(ty*128+tx)*2]
            for y in range(8):
                for x in range(8):
                    index=vram[(t*64+y*8+x)*2+1]&0x7f
                    if index:world.putpixel((tx*8+x,ty*8+y),colors[index])
    world.save(assets/'stage2-mode7-map.png')
    # Exact PPU matrix/scroll state at the ROM's "choose starting point" screen.
    keys=['mode7A','mode7B','mode7C','mode7D','mode7X','mode7Y','mode7Hoff','mode7Voff','mode7FlipX','mode7FlipY','mode7LargeField','mode7Char0fill']
    config={k:ppu[k] for k in keys};config['screenYOffset']=7;config['selectedStart']=1
    # Start markers are the five 8x8 OAM sprites with tile $28/palette 3.
    oam=(capture/'oam.bin').read_bytes();high=(capture/'highOam.bin').read_bytes();points=[]
    def clip(v):
        v &= 0xffff
        return (v | ~0x3ff) if v & 0x2000 else (v & 0x3ff)
    for i in range(128):
        x,y,t,a=oam[i*4:i*4+4]
        if t!=40 or ((a>>1)&7)!=3:continue
        hw=int.from_bytes(high[(i//4)*2:(i//4)*2+2],'little');flags=(hw>>(2*(i&3)))&3;size=16 if flags&2 else 8
        sx=x+size//2;sy=y+size//2+config['screenYOffset'];A=config['mode7A'];B=config['mode7B'];C=config['mode7C'];D=config['mode7D'];cx=config['mode7X'];cy=config['mode7Y'];ch=clip(config['mode7Hoff']-cx);cv=clip(config['mode7Voff']-cy);ry=sy-config['screenYOffset']
        x0=((A*ch)&~63)+((B*ry)&~63)+((B*cv)&~63)+(cx<<8);y0=((C*ch)&~63)+((D*ry)&~63)+((D*cv)&~63)+(cy<<8)
        points.append({'screen':[sx,sy],'world':[(x0+A*sx+B*ry)>>8,(y0+C*sx)>>8]})
    config['startPoints']=points
    (assets/'stage2-mode7.json').write_text(json.dumps(config,indent=2))
    # The marker art itself is the SNES sprite tile, not a drawn placeholder.
    sprite_base=2*(ppu['sprAdr1']+ppu['sprAdr2'])
    tile(vram[sprite_base:],40,colors[48:64],4).save(assets/'stage2-start-marker.png')

def main():
    import argparse
    ap=argparse.ArgumentParser();ap.add_argument('--rom',required=True,type=Path);ap.add_argument('--captures',required=True,type=Path);a=ap.parse_args();rom=a.rom.read_bytes();assets=ROOT/'web/assets';cap=a.captures/'level-loaded';vram=(cap/'vram.bin').read_bytes()
    paldata=b''.join(rom[o:o+32] for o in [0x400ac,0x400cc,0x40192,0x401b2,0x401d2,0x401f2,0x40212,0x40232,0x402f8,0x40318,0x403fc,0x4041c,0x4043c,0x40296,0x402b6,0x402d6])
    colors=palette(paldata);pals=[colors[i:i+16] for i in range(0,128,16)]
    tiles=b''.join(decompress(rom,p)[0] for p in [0x098000,0x09998e,0x09b32d,0x09cd49])
    specs=[('foreground',0x0ad871,0x0ab064),('background',0x0ade6d,0x0acdbc)]
    for name,mp,mt in specs:
        im=map_pages(decompress(rom,mp)[0],decompress(rom,mt)[0],tiles,pals);im.save(assets/f'stage1-{name}.png')
        im.resize((im.width//4,64),Image.Resampling.NEAREST).save(assets/f'stage1-{name}-overview.png')
    # Player graphics are uploaded dynamically in six strips. $05:B2AF maps animation
    # IDs to six source offsets and the two region-specific robot metasprites.
    ram=(cap/'ram.bin').read_bytes();pool=ram[0x10000:0x20000];atlas=Image.new('RGBA',(16*128,16*128));frames={}
    for fid in range(256):
        table=offset(0x05b2af)+fid*16
        sources=[word(rom,table+i*2) for i in range(6)];meta=word(rom,table+12)
        if not 0x8000<=meta<=0xff00:continue
        pos=offset(0x060000|meta);n=rom[pos]
        if not 0<n<=20:continue
        image=Image.new('RGBA',(128,128));records=[];valid=True
        for j in range(n):
            dx,dy,lo,hi=rom[pos+1+j*4:pos+5+j*4];entry=lo|hi<<8
            tnum=entry&511;large=bool(entry&0x2000);size=16 if large else 8
            if (tnum&15)>11 or tnum>=32:valid=False;break
            part=Image.new('RGBA',(size,size))
            for sy in range(size//8):
                for sx in range(size//8):
                    t=tnum+sy*16+sx;slot=(t&15)//2;off=sources[slot]+(t//16)*512+(t&1)*32
                    if off+32>len(pool):valid=False;break
                    part.alpha_composite(tile(pool[off:off+32],0,colors[13*16:14*16]),(sx*8,sy*8))
            if entry&0x4000:part=part.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            if entry&0x8000:part=part.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
            image.alpha_composite(part,(64+signed(dx),64+signed(dy)))
            records.append({'x':signed(dx),'y':signed(dy),'tile':tnum,'size':size})
        if not valid:continue
        atlas.alpha_composite(image,((fid%16)*128,(fid//16)*128));frames[str(fid)]={'metasprite':f'06:{meta:04X}','sources':sources,'parts':records}
    atlas.save(assets/'player-frames.png');(assets/'player-frames.json').write_text(json.dumps(frames))
    captured_background(a.captures/'stage1-entry',rom).save(assets/'title.png')
    captured_background(cap,rom).crop((0,0,256,24)).save(assets/'hud.png')
    stage2cap=a.captures/'stage2-point-select'
    if stage2cap.exists():build_mode7_assets(stage2cap,assets)
    # Standard weapon: frame-by-frame SNES Y capture shows OAM tile $00C
    # in sprite palette 7. Use the verified pad-2 capture for VRAM and CGRAM.
    fire=a.captures/'pad-2';fp=json.loads((fire/'ppu.json').read_text());fv=(fire/'vram.bin').read_bytes();
    # CGRAM is 256 SNES BGR555 entries; sprite palette 7 is entries 240-255.
    raw=(fire/'cgram.bin').read_bytes();spal=palette(raw)[240:256];base=fp['sprAdr1']*2+12*32
    shot=Image.new('RGBA',(8,8))
    for y in range(8):
        for x in range(8):
            v=sum(((fv[base+(bit//2)*16+y*2+(bit&1)]>>(7-x))&1)<<bit for bit in range(4))
            if v:shot.putpixel((x,y),spal[v])
    shot.save(assets/'projectile-standard.png')
    print('Built Stage 1 maps,',len(frames),'player frames, the base projectile, and Stage 2 Mode 7 data when captured.')

if __name__=='__main__':main()
