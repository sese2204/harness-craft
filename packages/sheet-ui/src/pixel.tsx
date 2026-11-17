// Pixel sprites drawn with the design's single-div box-shadow technique.
import { memo, type CSSProperties } from 'react';
import type { IconName } from '@harness-craft/sheet';

type Palette = Readonly<Record<string, string>>;

export const PAL: Palette = {
  W: '#f6f1e6', B: '#3b9cff', S: '#8fd0ff', G: '#6fe36f', R: '#ff5d73', P: '#ff9ad0',
  Y: '#ffc23d', K: '#1a1626', D: '#b05cff', O: '#ff8c42', T: '#7a5230',
};

export const ICONS: Readonly<Record<IconName, readonly string[]>> = {
  sword: ['.......W', '......WW', '.....WW.', '....WW..', '.T.WW...', '..TT....', '.TTT....', 'T..T....'],
  shield: ['.BBBBBB.', 'BBSSSSBB', 'BBSSSSBB', 'BBSSSSBB', '.BSSSSB.', '.BBSSBB.', '..BBBB..', '...BB...'],
  potion: ['...GG...', '...GG...', '..WWWW..', '.GRRRRG.', 'GRRRRRRG', 'GRRPRRRG', 'GRRRRRRG', '.GGGGGG.'],
  book: ['.DDDDDD.', 'DPPPPPPD', 'DPWWWWPD', 'DPPPPPPD', 'DPWWWWPD', 'DPPPPPPD', 'DDDDDDDD', '.D....D.'],
  gear: ['..G..G..', '.GGGGGG.', 'GGG..GGG', '.G....G.', '.G....G.', 'GGG..GGG', '.GGGGGG.', '..G..G..'],
  scroll: ['.YYYYYY.', 'YYWWWWYY', '.YWKKWY.', '.YWWWWY.', '.YWKKWY.', '.YWWWWY.', 'YYWWWWYY', '.YYYYYY.'],
  star: ['...YY...', '...YY...', '.YYYYYY.', 'YYYYYYYY', '.YYYYYY.', '..YYYY..', '.YY..YY.', 'YY....YY'],
  eye: ['..BBBB..', '.BWWWWB.', 'BWWKKWWB', 'BWKKKKWB', 'BWKKKKWB', 'BWWKKWWB', '.BWWWWB.', '..BBBB..'],
  key: ['.....YY.', '....Y..Y', '....Y..Y', '...YYYY.', '..YY....', '.YY.....', 'YYY.....', 'YY......'],
  bolt: ['....OO..', '...OO...', '..OOOO..', '.OOOOOO.', '...OO...', '..OO....', '.OO.....', 'OO......'],
};

const HERO = ['..HHHH..', '.HHHHHH.', '.HSSSSH.', '.SKSSKS.', '.SSSSSS.', '..CCCC..', '.CCCCCC.', '.CSCCSC.', '..PPPP..', '..P..P..'];

interface PixelArtProps {
  rows: readonly string[];
  scale: number;
  pal: Palette;
}

function shadowsOf(rows: readonly string[], scale: number, pal: Palette): string {
  const shadows: string[] = [];
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      const color = pal[c];
      if (c !== '.' && color) shadows.push(`${x * scale}px ${y * scale}px 0 0 ${color}`);
    }),
  );
  return shadows.join(',');
}

export const PixelArt = memo(function PixelArt({ rows, scale, pal }: PixelArtProps) {
  const outer: CSSProperties = { width: (rows[0]?.length ?? 0) * scale, height: rows.length * scale, position: 'relative' };
  const dot: CSSProperties = { position: 'absolute', left: 0, top: 0, width: scale, height: scale, boxShadow: shadowsOf(rows, scale, pal) };
  return (
    <div aria-hidden="true" style={outer}>
      <div style={dot} />
    </div>
  );
});

export function PixelIcon({ name, scale }: { name: IconName; scale: number }) {
  return <PixelArt rows={ICONS[name]} scale={scale} pal={PAL} />;
}

interface SpriteProps {
  hair: string;
  cloth: string;
  pants: string;
  scale: number;
}

export function PartySprite({ hair, cloth, pants, scale }: SpriteProps) {
  return <PixelArt rows={HERO} scale={scale} pal={{ H: hair, S: '#f2c9a0', K: '#1a1626', C: cloth, P: pants }} />;
}
