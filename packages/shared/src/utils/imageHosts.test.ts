import { describe, expect, it } from 'vitest';
import { allowedImageHosts, isAllowedImage, isHttpsLink, parseHostList } from './imageHosts';
import { parseVideoEmbedUrl } from './videoEmbed';

describe('parseHostList / allowedImageHosts (R23)', () => {
  it('cleans a comma list down to host names', () => {
    expect(parseHostList(' Images.Example.com, https://cdn.example.org/path ,, ')).toEqual(['images.example.com', 'cdn.example.org']);
    expect(parseHostList(undefined)).toEqual([]);
  });
  it('always includes the project storage host', () => {
    expect(allowedImageHosts('https://abc123.supabase.co', 'cdn.example.org')).toEqual(['abc123.supabase.co', 'cdn.example.org']);
    expect(allowedImageHosts('not a url', 'cdn.example.org')).toEqual(['cdn.example.org']);
    expect(allowedImageHosts(undefined, undefined)).toEqual([]);
  });
});

describe('isAllowedImage (R23)', () => {
  const allowed = ['abc123.supabase.co', 'cdn.example.org'];
  it('shows pictures from the gym storage and the owner list', () => {
    expect(isAllowedImage('https://abc123.supabase.co/storage/v1/object/public/x.jpg', allowed)).toBe(true);
    expect(isAllowedImage('https://cdn.example.org/a.png', allowed)).toBe(true);
    expect(isAllowedImage('https://eu.cdn.example.org/a.png', allowed)).toBe(true);
  });
  it('does not show pictures from anywhere else', () => {
    expect(isAllowedImage('https://tracker.example.net/pixel.gif', allowed)).toBe(false);
    expect(isAllowedImage('https://cdn.example.org.evil.net/a.png', allowed)).toBe(false);
    expect(isAllowedImage('https://evilcdn.example.org/a.png', allowed)).toBe(false); // ends with the same letters, but is not a subdomain
    expect(isAllowedImage('https://notcdn.example.org.evil/a.png', allowed)).toBe(false);
  });
  it('needs https, and an address', () => {
    expect(isAllowedImage('http://cdn.example.org/a.png', allowed)).toBe(false);
    expect(isAllowedImage('javascript:alert(1)', allowed)).toBe(false);
    expect(isAllowedImage(null, allowed)).toBe(false);
    expect(isAllowedImage('', allowed)).toBe(false);
  });
});

describe('isHttpsLink (ED)', () => {
  it('only lets https addresses be clickable', () => {
    expect(isHttpsLink('https://example.com/lesson.pdf')).toBe(true);
    expect(isHttpsLink('http://example.com')).toBe(false);
    expect(isHttpsLink('javascript:alert(1)')).toBe(false);
    expect(isHttpsLink('data:text/html,<script>')).toBe(false);
    expect(isHttpsLink('not a link')).toBe(false);
    expect(isHttpsLink(null)).toBe(false);
  });
});

describe('parseVideoEmbedUrl (ED1)', () => {
  it('embeds YouTube from the no-cookie host', () => {
    expect(parseVideoEmbedUrl('https://youtu.be/abc123')).toBe('https://www.youtube-nocookie.com/embed/abc123');
    expect(parseVideoEmbedUrl('https://www.youtube.com/watch?v=abc123')).toBe('https://www.youtube-nocookie.com/embed/abc123');
    expect(parseVideoEmbedUrl('https://www.youtube.com/shorts/abc123')).toBe('https://www.youtube-nocookie.com/embed/abc123');
    expect(parseVideoEmbedUrl('https://www.youtube.com/embed/abc123')).toBe('https://www.youtube-nocookie.com/embed/abc123');
  });
  it('still embeds Vimeo and leaves other links alone', () => {
    expect(parseVideoEmbedUrl('https://vimeo.com/12345')).toBe('https://player.vimeo.com/video/12345');
    expect(parseVideoEmbedUrl('https://example.com/lesson')).toBeNull();
  });
});
