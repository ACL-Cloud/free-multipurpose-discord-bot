'use strict';

const { EmbedBuilder } = require('discord.js');

// One accent colour for the whole bot; the status is carried by a single mark
// in the title so replies stay calm and readable.
const ACCENT = 0x3b6fd4;
const MARKS = { success: '✓', error: '✕', warn: '!', info: '' };

/**
 * Builds the shared base embed.
 * @param {{title?: string, description?: string, fields?: Array<{name: string, value: string, inline?: boolean}>, footer?: string, timestamp?: boolean}} [opts]
 * @returns {EmbedBuilder}
 */
function base(opts = {}) {
  const embed = new EmbedBuilder().setColor(ACCENT);
  if (opts.title) embed.setTitle(opts.title.slice(0, 256));
  if (opts.description) embed.setDescription(opts.description.slice(0, 4096));
  if (opts.fields?.length) embed.addFields(opts.fields.slice(0, 25).map((f) => ({ name: String(f.name).slice(0, 256), value: String(f.value || '-').slice(0, 1024), inline: !!f.inline })));
  if (opts.footer) embed.setFooter({ text: opts.footer.slice(0, 2048) });
  if (opts.timestamp) embed.setTimestamp();
  return embed;
}

const withMark = (kind) => (title, description, opts = {}) => {
  const mark = MARKS[kind];
  return base({ ...opts, title: title ? (mark ? `${mark} ${title}` : title) : undefined, description });
};

module.exports = {
  ACCENT,
  base,
  /** @type {(title: string, description?: string, opts?: object) => EmbedBuilder} */
  success: withMark('success'),
  /** @type {(title: string, description?: string, opts?: object) => EmbedBuilder} */
  error: withMark('error'),
  /** @type {(title: string, description?: string, opts?: object) => EmbedBuilder} */
  warn: withMark('warn'),
  /** @type {(title: string, description?: string, opts?: object) => EmbedBuilder} */
  info: withMark('info')
};
