/**
 * LINE Flex helpers — presentation only.
 * Calm nutrition-coach visual tokens (not corporate purple / neon).
 */

export const FlexTheme = {
  text: '#1A1F1C',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  accent: '#2D6A4F',
  accentSoft: '#D8F3DC',
  surface: '#FFFFFF',
  surfaceAlt: '#F4F7F5',
  border: '#E5EBE7',
  danger: '#B42318',
  warning: '#B54708',
  kcal: '#1B4332',
  primaryBtn: '#2D6A4F',
  secondaryBtn: '#FFFFFF',
  secondaryBorder: '#2D6A4F',
} as const;

export type FlexText = {
  type: 'text';
  text: string;
  size?: string;
  weight?: 'regular' | 'bold';
  color?: string;
  align?: 'start' | 'center' | 'end';
  wrap?: boolean;
  flex?: number;
  margin?: string;
  lineSpacing?: string;
};

export type FlexBox = {
  type: 'box';
  layout: 'horizontal' | 'vertical' | 'baseline';
  contents: FlexComponent[];
  spacing?: string;
  margin?: string;
  paddingAll?: string;
  paddingTop?: string;
  paddingBottom?: string;
  paddingStart?: string;
  paddingEnd?: string;
  backgroundColor?: string;
  cornerRadius?: string;
  borderColor?: string;
  borderWidth?: string;
  height?: string;
  flex?: number;
  alignItems?: 'flex-start' | 'center' | 'flex-end';
  justifyContent?:
    | 'flex-start'
    | 'center'
    | 'flex-end'
    | 'space-between'
    | 'space-around'
    | 'space-evenly';
  action?: FlexAction;
};

export type FlexSeparator = {
  type: 'separator';
  margin?: string;
  color?: string;
};

export type FlexSpacer = {
  type: 'spacer';
  size?: string;
};

export type FlexButton = {
  type: 'button';
  action: FlexAction;
  style?: 'primary' | 'secondary' | 'link';
  color?: string;
  height?: 'sm' | 'md';
  margin?: string;
  flex?: number;
};

export type FlexAction = {
  type: 'message' | 'uri' | 'postback';
  label: string;
  text?: string;
  uri?: string;
  data?: string;
};

export type FlexComponent =
  FlexText | FlexBox | FlexSeparator | FlexSpacer | FlexButton;

export type FlexBubble = {
  type: 'bubble';
  size?: 'nano' | 'micro' | 'kilo' | 'mega' | 'giga';
  styles?: {
    header?: { backgroundColor?: string };
    body?: { backgroundColor?: string };
    footer?: { backgroundColor?: string; separator?: boolean };
  };
  header?: FlexBox;
  body?: FlexBox;
  footer?: FlexBox;
};

export type FlexCarousel = {
  type: 'carousel';
  contents: FlexBubble[];
};

export type FlexMessagePayload = {
  type: 'flex';
  altText: string;
  contents: FlexBubble | FlexCarousel;
};

export function t(
  text: string,
  opts: Omit<FlexText, 'type' | 'text'> = {},
): FlexText {
  return { type: 'text', text: text.slice(0, 2000), wrap: true, ...opts };
}

export function sep(margin = '12px'): FlexSeparator {
  return { type: 'separator', margin, color: FlexTheme.border };
}

export function spacer(size: string = 'md'): FlexSpacer {
  return { type: 'spacer', size };
}

export function vbox(
  contents: FlexComponent[],
  opts: Omit<FlexBox, 'type' | 'layout' | 'contents'> = {},
): FlexBox {
  return { type: 'box', layout: 'vertical', contents, ...opts };
}

export function hbox(
  contents: FlexComponent[],
  opts: Omit<FlexBox, 'type' | 'layout' | 'contents'> = {},
): FlexBox {
  return { type: 'box', layout: 'horizontal', contents, ...opts };
}

export function messageAction(label: string, text: string): FlexAction {
  return { type: 'message', label: label.slice(0, 40), text };
}

export function primaryButton(label: string, text: string): FlexButton {
  return {
    type: 'button',
    style: 'primary',
    color: FlexTheme.primaryBtn,
    height: 'sm',
    action: messageAction(label, text),
  };
}

export function secondaryButton(label: string, text: string): FlexButton {
  return {
    type: 'button',
    style: 'secondary',
    color: FlexTheme.accent,
    height: 'sm',
    flex: 1,
    action: messageAction(label, text),
  };
}

export function linkButton(label: string, text: string): FlexButton {
  return {
    type: 'button',
    style: 'link',
    height: 'sm',
    color: FlexTheme.textSecondary,
    flex: 1,
    action: messageAction(label, text),
  };
}

/** Compact macro cell: label on top, value below. */
export function macroCell(label: string, value: string): FlexBox {
  return vbox(
    [
      t(label, {
        size: 'xxs',
        color: FlexTheme.textSecondary,
        align: 'center',
      }),
      t(value, {
        size: 'sm',
        weight: 'bold',
        color: FlexTheme.text,
        align: 'center',
        margin: '2px',
      }),
    ],
    { flex: 1 },
  );
}

/** Label | value row aligned for scanning. */
export function kvRow(
  label: string,
  value: string,
  opts: {
    labelColor?: string;
    valueColor?: string;
    valueWeight?: 'regular' | 'bold';
  } = {},
): FlexBox {
  return hbox(
    [
      t(label, {
        size: 'sm',
        color: opts.labelColor ?? FlexTheme.textSecondary,
        flex: 1,
      }),
      t(value, {
        size: 'sm',
        weight: opts.valueWeight ?? 'bold',
        color: opts.valueColor ?? FlexTheme.text,
        align: 'end',
        flex: 1,
      }),
    ],
    { spacing: 'md' },
  );
}

/**
 * Simple progress track using flex ratios (0–100).
 * Over-target (>=100) fills full accent then soft warning tint.
 */
export function progressBar(percent: number): FlexBox {
  const capped = Math.max(0, Math.min(100, Math.round(percent)));
  const over = percent > 100;
  const fill = Math.max(1, capped);
  const rest = Math.max(1, 100 - capped);
  const fillColor = over ? FlexTheme.warning : FlexTheme.accent;

  const contents: FlexComponent[] =
    capped <= 0
      ? [
          {
            type: 'box',
            layout: 'vertical',
            contents: [],
            flex: 1,
            backgroundColor: FlexTheme.border,
          },
        ]
      : capped >= 100
        ? [
            {
              type: 'box',
              layout: 'vertical',
              contents: [],
              flex: 1,
              backgroundColor: fillColor,
              cornerRadius: '4px',
            },
          ]
        : [
            {
              type: 'box',
              layout: 'vertical',
              contents: [],
              flex: fill,
              backgroundColor: fillColor,
              cornerRadius: '4px',
            },
            {
              type: 'box',
              layout: 'vertical',
              contents: [],
              flex: rest,
              backgroundColor: FlexTheme.border,
            },
          ];

  return {
    type: 'box',
    layout: 'horizontal',
    height: '8px',
    cornerRadius: '4px',
    backgroundColor: FlexTheme.border,
    contents,
  };
}

export function sectionLabel(text: string): FlexText {
  return t(text, {
    size: 'xs',
    weight: 'bold',
    color: FlexTheme.accent,
  });
}

export function truncate(text: string, max = 80): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function flexMessage(
  altText: string,
  bubble: FlexBubble,
): FlexMessagePayload {
  return {
    type: 'flex',
    altText: altText.slice(0, 400),
    contents: bubble,
  };
}
