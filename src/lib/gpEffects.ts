/**
 * Guitar Pro 파일에서 트랙별 이펙터 설정을 직접 읽는다.
 *
 * GP3~GP5는 트랙마다 코러스·리버브·페이저·트레몰로 값을 MIDI 채널 정보에
 * 담아 둔다. 그런데 alphaTab의 데이터 모델(`PlaybackInformation`)에는 이
 * 항목들이 아예 없어서 파일을 읽는 순간 버려진다. 그래서 파일 바이트를
 * 한 번 더 훑어 직접 꺼낸다.
 *
 * 채널 정보는 파일 앞쪽(마디·음표보다 먼저)에 있어서 헤더만 읽으면 닿는다.
 * 트랙이 몇 번 채널을 쓰는지는 alphaTab이 이미 알려주므로
 * (`track.playbackInfo.primaryChannel`) 트랙 정의까지 읽을 필요는 없다.
 *
 * GP6·GP7(.gp, .gpx)은 완전히 다른 포맷(압축 파일)이라 여기서 다루지 않는다.
 */

/** 한 MIDI 채널의 이펙터 설정. 값의 범위는 0~128이다. */
export interface ChannelEffects {
  /** 이 채널의 악기 번호. 트랙과 채널을 맞게 짝지었는지 확인하는 데 쓴다. */
  program: number;
  chorus: number;
  reverb: number;
  phaser: number;
  tremolo: number;
}

/**
 * 트랙이 쓰는 채널의 이펙터를 찾는다. 못 찾으면 null.
 *
 * 파일의 채널 번호를 그대로 쓸 수 없다. alphaTab은 파일을 읽으면서 채널을
 * 다시 배정하는데, 관찰해보면 파일 채널 하나에 MIDI 채널 두 개를 잡아
 * 번호가 두 배가 된다(타악기는 MIDI 규격상 9번 고정).
 *
 * 다만 이건 alphaTab 안쪽 사정이라 언제 바뀔지 모른다. 그래서 짐작한
 * 자리의 악기 번호가 실제 트랙의 악기와 같은지 확인하고, 어긋나면 아무것도
 * 돌려주지 않는다 — 틀린 값을 보여주느니 안 보여주는 편이 낫다.
 */
export function effectsForTrack(
  channels: ChannelEffects[],
  primaryChannel: number,
  program: number,
): ChannelEffects | null {
  for (const index of [Math.floor(primaryChannel / 2), primaryChannel]) {
    const channel = channels[index];
    if (channel && channel.program === program) return channel;
  }
  return null;
}

const EFFECT_LABELS: Array<[keyof ChannelEffects, string]> = [
  ["chorus", "코러스"],
  ["reverb", "리버브"],
  ["phaser", "페이저"],
  ["tremolo", "트레몰로"],
];

/**
 * 사람이 읽을 만한 세기로 바꾼다.
 *
 * 0~128 숫자를 그대로 보여주면 초보자에게는 아무 뜻이 없다. 값이 아주 작을
 * 때는 아예 걸지 않은 것과 구분이 안 되므로 언급하지 않는다.
 */
export function describeEffects(fx: ChannelEffects): string[] {
  const out: string[] = [];
  for (const [key, label] of EFFECT_LABELS) {
    const v = fx[key];
    if (v < 16) continue;
    out.push(`${label} ${v >= 96 ? "강하게" : v >= 48 ? "보통" : "살짝"}`);
  }
  return out;
}

class Reader {
  private pos = 0;

  constructor(private readonly view: DataView) {}

  get done(): boolean {
    return this.pos >= this.view.byteLength;
  }

  skip(n: number): void {
    this.pos += n;
  }

  u8(): number {
    return this.view.getUint8(this.pos++);
  }

  i8(): number {
    return this.view.getInt8(this.pos++);
  }

  i16(): number {
    const v = this.view.getInt16(this.pos, true);
    this.pos += 2;
    return v;
  }

  i32(): number {
    const v = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  }

  /** 길이 바이트가 앞에 붙고 전체 자리는 `count`로 고정된 문자열. */
  byteSizeString(count: number): string {
    const size = this.u8();
    const start = this.pos;
    this.pos += count;
    return this.text(start, Math.min(size, count));
  }

  /** 전체 자리를 int로 먼저 적고, 그 안에 길이 바이트가 또 있는 문자열. */
  intByteSizeString(): string {
    return this.byteSizeString(this.i32() - 1);
  }

  /** 길이를 int로 적고 그만큼 이어지는 문자열. */
  intSizeString(): string {
    const count = this.i32();
    const start = this.pos;
    this.pos += count;
    return this.text(start, count);
  }

  private text(start: number, length: number): string {
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + start, length);
    return String.fromCharCode(...bytes);
  }
}

/** 파일에 적힌 버전 문자열을 (주, 부, 수정) 숫자로 바꾼다. */
function parseVersion(text: string): [number, number, number] | null {
  const m = /v(\d+)\.(\d)(\d)/.exec(text);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** GP가 파일에 담는 0~16 값을 재생기가 쓰는 0~128로 옮긴다. */
const toChannelValue = (raw: number) => Math.min(Math.max((raw << 3) - 1, -1), 32767) + 1;

/**
 * 채널 정보 앞에 놓인 헤더를 건너뛴다.
 *
 * 버전마다 항목이 다르다 — GP4에서 가사가, GP5에서 RSE 마스터 이펙트와
 * 페이지 설정이 들어왔다. 순서를 하나라도 틀리면 그 뒤가 전부 어긋나므로
 * 버전별로 갈라 정확히 따라간다.
 */
function skipToChannels(r: Reader, version: [number, number, number]): void {
  const [major, minor] = version;

  // 곡 정보. GP5부터 작곡가(music)가 작사가(words)와 분리됐다.
  const infoFields = major >= 5 ? 9 : 8;
  for (let i = 0; i < infoFields; i++) r.intByteSizeString();
  const noticeLines = r.i32();
  for (let i = 0; i < noticeLines; i++) r.intByteSizeString();

  if (major < 5) r.u8(); // 셋잇단 느낌

  if (major >= 4) {
    // 가사: 어느 트랙에 붙는지 + 다섯 줄
    r.i32();
    for (let i = 0; i < 5; i++) {
      r.i32();
      r.intSizeString();
    }
  }

  if (major >= 5) {
    if (minor > 0) {
      r.i32(); // RSE 마스터 볼륨
      r.i32(); // 예약
      r.skip(11); // 이퀄라이저 (밴드 10 + 게인)
    }
    // 페이지 설정: 크기·여백·비율·머리말 플래그 + 문구 10줄
    r.skip(4 * 7);
    r.i16();
    for (let i = 0; i < 10; i++) r.intByteSizeString();
    r.intByteSizeString(); // 템포 이름
  }

  r.i32(); // 템포
  if (major >= 5) {
    if (minor > 0) r.u8(); // 템포 숨김
    r.i8(); // 조표
    r.i32(); // 옥타브
  } else {
    r.i32(); // 조표
    if (major >= 4) r.i8(); // 옥타브
  }
}

/**
 * 채널별 이펙터 설정을 읽는다. 실패하면 빈 배열을 준다.
 *
 * 이 정보는 있으면 좋은 것이지 없으면 안 되는 것이 아니다. 포맷을 잘못
 * 짚었다고 악보를 못 열게 되면 손해가 더 크므로, 어긋나면 조용히 포기한다.
 */
export function readChannelEffects(data: Uint8Array): ChannelEffects[] {
  try {
    const r = new Reader(new DataView(data.buffer, data.byteOffset, data.byteLength));
    const version = parseVersion(r.byteSizeString(30));
    if (!version || version[0] < 3 || version[0] > 5) return [];

    skipToChannels(r, version);

    // 4개 포트 × 16채널. 각 채널은 12바이트다.
    const channels: ChannelEffects[] = [];
    for (let i = 0; i < 64; i++) {
      // 타악기 채널은 악기 번호를 -1로 적어두기도 한다
      const program = Math.max(r.i32(), 0);
      r.i8(); // 볼륨
      r.i8(); // 밸런스
      const chorus = toChannelValue(r.i8());
      const reverb = toChannelValue(r.i8());
      const phaser = toChannelValue(r.i8());
      const tremolo = toChannelValue(r.i8());
      r.skip(2); // 3.0 호환용 빈자리
      channels.push({ program, chorus, reverb, phaser, tremolo });
    }
    if (r.done) return []; // 파일 끝을 넘겼다면 어딘가 어긋난 것이다
    return channels;
  } catch {
    return [];
  }
}
