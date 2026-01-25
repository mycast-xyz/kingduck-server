import fs from 'fs';
import path from 'path';

interface RawSection {
  tab: string;
  title: string;
  content: string;
  images: string[];
  links: { text: string; href: string }[];
}

interface RawCharacter {
  name: string;
  metadata: {
    skills: {
      sections: RawSection[];
    };
    skins: any[];
    [key: string]: any;
  };
  [key: string]: any;
}

function parseEfficiency(content: string) {
  const lines = content.split('\n');
  const table: { level: string; value: string }[] = [];
  const summary: string[] = [];

  const regex = /(\d)형상\t([\d.]+%)/;

  for (const line of lines) {
    const match = line.match(regex);
    if (match) {
      table.push({ level: match[1], value: match[2] });
    } else {
      if (line.trim()) summary.push(line.trim());
    }
  }
  return { summary: summary.join('\n'), table };
}

function parseBuilds(sections: RawSection[]) {
  const build: any = {
    resonance: [],
    psychubes: [],
  };

  const resonanceSec = sections.find((s) => s.title === '공명 변조');
  if (resonanceSec) {
    // "1순위\n불시의 의아함\n2순위\n순식간의 광증"
    const lines = resonanceSec.content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l);
    for (let i = 0; i < lines.length; i += 2) {
      if (lines[i] && lines[i + 1]) {
        build.resonance.push({
          priority: lines[i],
          name: lines[i + 1],
        });
      }
    }
  }

  const cubeSec = sections.find((s) => s.title === '의지 추천');
  if (cubeSec) {
    // "0 순위\n일화\n2.3\n미로의 밖\n\nS (딜보조)"
    // This is harder to parse linearly due to variable fields.
    // But looking at the text provided:
    // "0 순위", "일화", "2.3", "미로의 밖", "S (딜보조)"
    // Let's try to simple string splitting for now, or just return raw content if too complex.

    // Strategy: Split by "순위" keyword?
    const raw = cubeSec.content;
    const parts = raw.split(/(\d\s*순위)/).filter((p) => p.trim());

    // parts[0] = "0 순위", parts[1] = "Rest of content..."
    for (let i = 0; i < parts.length; i += 2) {
      const rank = parts[i]?.trim();
      const details = parts[i + 1]
        ?.trim()
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      if (rank && details) {
        build.psychubes.push({
          rank,
          details, // Let's keep array for safety
        });
      }
    }
  }

  return build;
}

function parseTeams(sections: RawSection[]) {
  const teams: any[] = [];

  const teamSections = sections.filter(
    (s) => s.title.includes('덱') || s.title.includes('조합'),
  );

  for (const sec of teamSections) {
    if (sec.title === '사용 조합 목록') continue; // Skip the "View All" button section

    // Members are best extracted from links usually, as they contain structured text like "1.6\n광상\n딜러"
    // But looking at mercury data, the links have text: "1.6\n광상\n딜러".
    // And the href points to character/22.

    const members = sec.links.map((link) => {
      const parts = link.text.split('\n');
      // Usually: [Version, Element, Role] or similar.
      return {
        role_info: parts,
        url: link.href,
      };
    });

    // Tags are usually at the start of content before the first member text.
    // This is fuzzy. Let's just store the whole content for 'tags/desc' reference for now
    // or try to filter out lines that match member info.

    teams.push({
      name: sec.title,
      members,
      raw_content: sec.content,
    });
  }

  return teams;
}

function transform(data: RawCharacter[]) {
  return data.map((char) => {
    const sections = char.metadata.skills.sections;

    const profileSec = sections.find((s) => s.title === '간단 소개');
    const profileTags = profileSec
      ? profileSec.content.split('\n').filter(Boolean)
      : [];

    const efficiencySec = sections.find((s) => s.title === '형상 효율 정리');
    const efficiency = efficiencySec
      ? parseEfficiency(efficiencySec.content)
      : null;

    const builds = parseBuilds(sections);
    const teams = parseTeams(sections);

    return {
      name: char.name,
      originalId: char.metadata.originalId,
      rarity: char.rarity,
      role: char.role,
      afflatus: char.metadata.afflatus,
      profile: {
        tags: profileTags,
      },
      efficiency,
      builds,
      teams,
      skins: char.metadata.skins,
      original_sections: sections.map((s) => s.title), // valid debug info
    };
  });
}

const rawData = JSON.parse(fs.readFileSync('mercuria_data.json', 'utf-8'));
const structured = transform(rawData);

console.log(JSON.stringify(structured, null, 2));
fs.writeFileSync(
  'mercuria_structured.json',
  JSON.stringify(structured, null, 2),
);
