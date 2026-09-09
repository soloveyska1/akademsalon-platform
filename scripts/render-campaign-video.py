#!/usr/bin/env python3
"""Original typographic film. Pillow frames piped directly to ffmpeg."""
from pathlib import Path
import math, subprocess, argparse
from functools import lru_cache
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[1]
W,H,FPS=1080,1350,24
PAPER='#f7f3e9'; INK='#30283e'; VIOLET='#5738ad'; MINT='#d8f2b3'
@lru_cache(maxsize=128)
def font(size,serif=False,latin=False):
    name='literata-normal-300-700-cyrillic-core.woff2' if serif else 'golos-text-normal-500-cyrillic.woff2'
    if latin:name='literata-normal-300-700-latin.woff2' if serif else 'golos-text-normal-500-latin.woff2'
    return ImageFont.truetype(str(ROOT/'assets/fonts'/name),size)
class MixedDraw:
    def __init__(self,im):self.raw=ImageDraw.Draw(im)
    def __getattr__(self,key):return getattr(self.raw,key)
    def text(self,xy,value,**kw):
        base=kw.pop('font');serif='literata' in str(base.path);x,y=xy
        for char in value:
            f=font(base.size,serif,not ('\u0400'<=char<='\u052f'))
            self.raw.text((x,y),char,font=f,**kw);x+=f.getlength(char)
def ease(x): return 1-(1-max(0,min(1,x)))**3
def frame(t):
    scene=min(3,int(t/4)); local=t-scene*4; enter=ease(local/.8); dy=int((1-enter)*90)
    bg=PAPER if scene in (0,1) else VIOLET
    fg=INK if scene in (0,1) else PAPER
    im=Image.new('RGB',(W,H),bg);d=MixedDraw(im)
    def text(x,y,value,size=42,color=fg,serif=False):d.text((x,y+dy),value,font=font(size,serif),fill=color,stroke_width=0)
    # Quiet moving orbit connects the projects, without distracting strobe.
    cx,cy=900+int(40*math.sin(t*.4)),280+int(30*math.cos(t*.5))
    d.ellipse((cx-300,cy-300,cx+300,cy+300),outline='#ded6e8' if scene<2 else '#7860bc',width=2)
    text(76,70,'КЛАДОВАЯ × САЛОН',28)
    if scene==0:
        text(76,230,'Твоя учёба.',94,serif=True);text(76,350,'Всё под рукой.',91,serif=True)
        cards=[(90,660,'к.','Кладовая ГИПСР',MINT),(555,730,'а.','Академический',VIOLET)]
        for i,(x,y,mark,label,color) in enumerate(cards):
            y+=int(14*math.sin(t+i));d.rounded_rectangle((x,y,x+435,y+440),radius=32,fill=color)
            c=INK if i==0 else PAPER
            d.text((x+38,y+16),mark,font=font(170,True),fill=c)
            d.text((x+38,y+308),label,font=font(28),fill=c)
            if i:d.text((x+38,y+348),'Салон',font=font(28),fill=c)
        text(76,1220,'Два проекта. Один круг своих.',32)
    elif scene==1:
        text(76,220,'В Кладовой',86,serif=True);text(76,326,'всё по полочкам.',77,serif=True)
        for i,label in enumerate(['Расписание','Учебные материалы','Правила института']):
            y=570+i*148+dy;d.rounded_rectangle((76,y,1004,y+122),radius=22,fill='white');d.text((112,y+34),label,font=font(43),fill=INK);d.ellipse((915,y+42,951,y+78),fill=MINT)
        text(76,1080,'Бесплатно. Для студентов ГИПСР.',33)
        text(76,1220,'studkladovaya.ru',30)
    elif scene==2:
        text(76,220,'А сложное',96,serif=True);text(76,335,'разберём вместе.',79,serif=True)
        for i,(head,note) in enumerate([('Разбор и редактура','Понятные замечания и следующий шаг'),('Статистика','От данных к обоснованным выводам'),('Подготовка к защите','Презентация, речь, уверенная структура')]):
            y=570+i*180+dy;d.line((76,y,1004,y),fill='#9480ca',width=2);d.text((76,y+24),head,font=font(49),fill=PAPER);d.text((76,y+94),note,font=font(27),fill='#ddd3f4')
        text(76,1220,'Академический Салон',32)
    else:
        text(76,220,'Сначала ясно.',91,serif=True);text(76,335,'Потом спокойно.',82,serif=True)
        for i,label in enumerate(['Состав задачи','Стоимость и сроки','Всё в личном кабинете']):
            y=570+i*115+dy;d.ellipse((78,y+8,105,y+35),fill=MINT);d.text((136,y),label,font=font(43),fill=PAPER)
        d.rounded_rectangle((76,990+dy,1004,1110+dy),radius=26,fill=MINT);d.text((125,1026+dy),'Найди своё по ссылкам под видео',font=font(35),fill=INK)
        text(76,1220,'akademsalon.ru',32)
    # Scene cuts use a short soft crossfade in the renderer, no flash overlays.
    return im

def main():
    p=argparse.ArgumentParser();p.add_argument('--output',type=Path,default=ROOT/'assets/campaigns/autumn-2026/two-projects.mp4');p.add_argument('--poster-only',action='store_true');a=p.parse_args();a.output.parent.mkdir(parents=True,exist_ok=True)
    frame(13.4).save(a.output.with_suffix('.jpg'),quality=94)
    if a.poster_only:return
    cmd=['/opt/homebrew/bin/ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-vcodec','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-threads','2','-preset','medium','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',str(a.output)]
    proc=subprocess.Popen(cmd,stdin=subprocess.PIPE)
    try:
        for i in range(16*FPS):
            t=i/FPS;im=frame(t)
            if t>=4 and t%4<.22:im=Image.blend(frame(int(t/4)*4-.001),im,ease((t%4)/.22))
            proc.stdin.write(im.tobytes())
    finally:proc.stdin.close()
    if proc.wait():raise SystemExit('ffmpeg failed')
    print(a.output)
if __name__=='__main__':main()
