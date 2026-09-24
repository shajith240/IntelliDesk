/**
 * Column template shared by the queue header, rows and skeleton. Tiers are
 * container widths: 560px single-line row, 860px adds customer + AI confidence,
 * 1100px adds updated, 1240px adds category. Hidden cells are display:none, so
 * they never consume a track at a narrower tier.
 */
export const ROW_GRID =
	"@min-[560px]:grid-cols-[16px_84px_minmax(0,1fr)_108px_68px_24px_28px] " +
	"@min-[860px]:grid-cols-[16px_84px_minmax(0,1fr)_150px_108px_92px_68px_24px_28px] " +
	"@min-[1100px]:grid-cols-[16px_84px_minmax(0,1fr)_170px_108px_92px_68px_24px_56px_28px] " +
	"@min-[1240px]:grid-cols-[16px_84px_minmax(0,1fr)_170px_140px_108px_92px_68px_24px_56px_28px]";

export const HIDE_860 = "hidden @min-[860px]:block";
export const HIDE_1100 = "hidden @min-[1100px]:block";
export const HIDE_1240 = "hidden @min-[1240px]:block";
