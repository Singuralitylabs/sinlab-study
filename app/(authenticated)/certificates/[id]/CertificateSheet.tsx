import { Cormorant_Garamond, Noto_Serif_JP } from "next/font/google";
import Image from "next/image";
import { CERTIFICATE_LOGO_SRC, CERTIFICATE_SERVICE_NAME } from "@/app/constants/certificate";
import { CERTIFICATE_MASCOT } from "@/app/constants/mascot";
import type { CertificateThemeColors } from "@/app/lib/certificate-palette";

// Japanese fonts are split by unicode-range and fetched on demand; preloading would pull every
// subset onto a page that only needs the few glyphs printed here.
const serifJp = Noto_Serif_JP({
  weight: ["500", "700", "900"],
  subsets: ["latin"],
  preload: false,
});
const latinSerif = Cormorant_Garamond({ weight: "600", style: "italic", subsets: ["latin"] });

// Gold is shared by every theme: it keeps pale and dark theme colors equally festive and is what
// makes the sheet read as a certificate rather than a card.
const GOLD_GRADIENT =
  "linear-gradient(135deg, #B8860B 0%, #F5D77A 28%, #C9A13A 50%, #FBE7A1 72%, #A87A12 100%)";
const GOLD_STOPS = [
  { offset: "0", color: "#A87A12" },
  { offset: "0.35", color: "#F8DE8A" },
  { offset: "0.6", color: "#C9A13A" },
  { offset: "1", color: "#8F6610" },
] as const;

// One sheet per page, so fixed SVG ids cannot collide.
function GoldGradient({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
      {GOLD_STOPS.map((stop) => (
        <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
      ))}
    </linearGradient>
  );
}

const CORNERS = [
  { position: "left-[4.4cqw] top-[4.4cqw]", rotate: 0 },
  { position: "right-[4.4cqw] top-[4.4cqw]", rotate: 90 },
  { position: "right-[4.4cqw] bottom-[4.4cqw]", rotate: 180 },
  { position: "left-[4.4cqw] bottom-[4.4cqw]", rotate: 270 },
] as const;

function CornerOrnament({ position, rotate }: { position: string; rotate: number }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={`absolute h-[9cqw] w-[9cqw] ${position}`}
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      <path d="M2 38 V2 H38" fill="none" stroke="url(#cert-gold)" strokeWidth="1.6" />
      <path d="M6 38 V6 H38" fill="none" stroke="url(#cert-gold)" strokeWidth="0.6" />
      <path d="M2 2 L10 10" stroke="url(#cert-gold)" strokeWidth="0.8" />
      <rect
        x="8"
        y="8"
        width="5"
        height="5"
        transform="rotate(45 10.5 10.5)"
        fill="url(#cert-gold)"
      />
    </svg>
  );
}

const SEAL_POINTS = Array.from({ length: 24 }, (_, i) => i * 15);

function Seal({ colors }: { colors: CertificateThemeColors }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className="absolute bottom-[5.6cqw] left-1/2 h-[12.5cqw] w-[12.5cqw] -translate-x-1/2"
    >
      <path d="M30 70 L22 99 L34 92 L40 100 L46 74Z" fill={colors.frame} />
      <path d="M70 70 L78 99 L66 92 L60 100 L54 74Z" fill={colors.accent} />
      <g transform="translate(50 46)">
        {SEAL_POINTS.map((deg) => (
          <path
            key={deg}
            d="M0 -40 L5 -33 L-5 -33Z"
            fill="url(#cert-gold)"
            transform={`rotate(${deg})`}
          />
        ))}
        <circle r="34" fill="url(#cert-gold)" />
        <circle r="29" fill="none" stroke="#FFFFFF88" strokeWidth="0.8" />
        <circle r="26" fill={colors.frame} />
        <text
          y="-6"
          textAnchor="middle"
          fontSize="8"
          letterSpacing="1"
          fill="#F8DE8A"
          style={{ fontFamily: latinSerif.style.fontFamily }}
        >
          SINLAB
        </text>
        <text
          y="6"
          textAnchor="middle"
          fontSize="12"
          fontWeight="900"
          fill="#FFFFFF"
          style={{ fontFamily: serifJp.style.fontFamily }}
        >
          修了
        </text>
        <text
          y="16"
          textAnchor="middle"
          fontSize="6"
          letterSpacing="1"
          fill="#F8DE8A"
          style={{ fontFamily: latinSerif.style.fontFamily }}
        >
          STUDY
        </text>
      </g>
    </svg>
  );
}

// Long names step down in size so the text block stays above the seal and the mascot: a name can
// be up to 50 characters (DISPLAY_NAME_MAX_LENGTH) and theme names have no length limit. Full-class
// strings, because Tailwind only emits classes it can see literally.
function recipientNameSize(name: string): string {
  const length = [...name].length;
  if (length <= 12) return "text-[4.2cqw]";
  if (length <= 20) return "text-[3.4cqw]";
  return "text-[2.6cqw]";
}

function statementSize(themeName: string): string {
  return [...themeName].length <= 24 ? "text-[2.1cqw]" : "text-[1.8cqw]";
}

interface CertificateSheetProps {
  recipientName: string;
  themeName: string;
  issuedDate: string;
  certificateNo: string;
  issuerName: string | null;
  colors: CertificateThemeColors;
}

// The sheet is a fixed light design (explicit colors, not theme tokens) so it reads the same on
// screen in dark mode and on paper. Sizes use container units (cqw) of the sheet width, so the
// layout scales identically on screen and at A4 landscape width (297mm) when printed. The date
// block, the seal and the mascot share the bottom edge; the date block is width-capped so a long
// issuer name wraps instead of running under the seal. Image `sizes` are the printed width at
// 300dpi, not the screen width: the browser does not re-pick a source when printing, so a
// screen-sized choice would print blurry.
export function CertificateSheet({
  recipientName,
  themeName,
  issuedDate,
  certificateNo,
  issuerName,
  colors,
}: CertificateSheetProps) {
  const goldRule = { backgroundImage: GOLD_GRADIENT };
  return (
    <div
      className={`@container certificate-sheet relative mx-auto aspect-[297/210] min-w-[640px] w-full overflow-hidden text-neutral-900 shadow-md print:h-[209mm] print:w-[297mm] print:min-w-0 print:max-w-none print:shadow-none ${serifJp.className}`}
      style={{
        backgroundImage: `radial-gradient(ellipse at 50% 40%, #FFFFFF 0%, #FFFDF7 55%, ${colors.paper} 100%)`,
      }}
    >
      <svg aria-hidden="true" className="absolute h-0 w-0">
        <defs>
          <GoldGradient id="cert-gold" />
        </defs>
      </svg>

      <svg
        aria-hidden="true"
        viewBox="0 0 297 210"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-55"
      >
        <defs>
          <pattern id="cert-guilloche" width="14" height="14" patternUnits="userSpaceOnUse">
            {[
              [7, 7],
              [0, 0],
              [14, 14],
              [14, 0],
              [0, 14],
            ].map(([cx, cy]) => (
              <circle
                key={`${cx}-${cy}`}
                cx={cx}
                cy={cy}
                r="6"
                fill="none"
                stroke={colors.pattern}
                strokeWidth="0.25"
              />
            ))}
          </pattern>
          {/* Fades the pattern out behind the text so it stays an edge texture. */}
          <radialGradient id="cert-fade" cx="50%" cy="50%" r="60%">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity="1" />
            <stop offset="0.55" stopColor="#FFFFFF" stopOpacity="0.85" />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="297" height="210" fill="url(#cert-guilloche)" />
        <rect width="297" height="210" fill="url(#cert-fade)" />
      </svg>

      <div
        className="absolute inset-[2.2cqw] border-[1.1cqw] border-solid"
        style={{ borderColor: colors.frame }}
      />
      <div
        className="absolute inset-[3.6cqw] border-[0.25cqw] border-solid"
        style={{ borderImage: `${GOLD_GRADIENT} 1` }}
      />
      <div aria-hidden="true" className="pointer-events-none">
        {CORNERS.map((corner) => (
          <CornerOrnament key={corner.rotate} position={corner.position} rotate={corner.rotate} />
        ))}
      </div>

      <Image
        src={CERTIFICATE_LOGO_SRC}
        alt={CERTIFICATE_SERVICE_NAME}
        width={512}
        height={512}
        sizes="300px"
        className="pointer-events-none absolute right-[7cqw] top-[6.6cqw] h-[6.5cqw] w-[6.5cqw] rounded-[1.2cqw] shadow-sm"
      />
      <Image
        src={CERTIFICATE_MASCOT.src}
        alt={CERTIFICATE_MASCOT.alt}
        width={800}
        height={800}
        sizes="600px"
        className="pointer-events-none absolute bottom-[5.2cqw] right-[6.2cqw] h-[17cqw] w-[17cqw]"
      />

      <div className="relative flex flex-col items-center px-[12cqw] pt-[7.4cqw] text-center">
        <p
          className={`text-[2.4cqw] tracking-[0.15em] ${latinSerif.className}`}
          style={{ color: colors.accent }}
        >
          Certificate of Completion
        </p>
        <div className="mt-[0.6cqw] flex items-center gap-[2cqw]">
          <span aria-hidden="true" className="h-[0.2cqw] w-[8cqw]" style={goldRule} />
          {/* The negative margin cancels the trailing letter-spacing so the word stays centered. */}
          <h2
            className="mr-[-0.45em] text-[6.4cqw] font-black tracking-[0.45em]"
            style={{ color: colors.heading }}
          >
            修了証
          </h2>
          <span aria-hidden="true" className="h-[0.2cqw] w-[8cqw]" style={goldRule} />
        </div>

        <p
          className={`mt-[3.6cqw] max-w-[60cqw] break-words font-bold leading-[1.35] ${recipientNameSize(recipientName)}`}
        >
          {recipientName}
          <span className="ml-[1.2cqw] text-[2cqw] font-medium">殿</span>
        </p>
        <span aria-hidden="true" className="mt-[0.6cqw] h-[0.22cqw] w-[48cqw]" style={goldRule} />
        <p
          className={`mt-[2.6cqw] max-w-[66cqw] font-medium leading-[1.9] text-neutral-700 ${statementSize(themeName)}`}
        >
          あなたは「
          <span className="font-bold" style={{ color: colors.accent }}>
            {themeName}
          </span>
          」の
          <br />
          全課程を修了したことを証します。
        </p>
      </div>

      <div className="absolute bottom-[7cqw] left-[10cqw] max-w-[30cqw] text-left">
        <p className="text-[1.8cqw]">{issuedDate}</p>
        <p className="mt-[0.4cqw] text-[1.3cqw] tracking-[0.05em] text-neutral-600">
          証明番号 {certificateNo}
        </p>
        <p className="mt-[1.2cqw] text-[2.1cqw] font-bold" style={{ color: colors.frame }}>
          {CERTIFICATE_SERVICE_NAME}
        </p>
        {issuerName && <p className="text-[1.5cqw]">{issuerName}</p>}
      </div>

      <Seal colors={colors} />
    </div>
  );
}
