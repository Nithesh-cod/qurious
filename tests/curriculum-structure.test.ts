/**
 * The curriculum's shape, pinned.
 *
 * The hierarchy is Module → Topic → lesson unit, with prerequisites stored as data so
 * the UI can act on them. Data like that goes wrong quietly: a typo in a prerequisite id
 * points at nothing and simply stops nudging, a lesson dropped from a topic vanishes from
 * the roadmap without any error, and a cycle in the prerequisite graph makes "what should
 * I do next" unanswerable. None of that throws. All of it is caught here.
 */

import { describe, expect, it } from 'vitest';
import {
  MODULES, TOPICS, topicById, topicOf, lessonsOfTopic, topicQuestions,
  topicProgress, topicReadiness, nextTopic, unlockedBy, earnedTopicBadges,
} from '../src/content/modules';
import { ALL_LESSONS, QUIZZES } from '../src/content/curriculum';

describe('hierarchy integrity', () => {
  it('every module has topics, and its lesson list is exactly its topics flattened', () => {
    for (const m of MODULES) {
      expect(m.topics.length, `${m.id} has no topics`).toBeGreaterThan(0);
      expect(m.lessons, `${m.id}: lessons must be derived from topics`)
        .toEqual(m.topics.flatMap(t => t.lessons));
    }
  });

  it('every lesson id in every topic resolves to a real lesson', () => {
    for (const t of TOPICS) {
      for (const id of t.lessons) {
        expect(ALL_LESSONS.find(l => l.id === id), `${t.id} -> missing lesson "${id}"`).toBeDefined();
      }
    }
  });

  it('no lesson is claimed by two topics', () => {
    const claimed = TOPICS.flatMap(t => t.lessons);
    expect(new Set(claimed).size, 'a lesson appears in more than one topic').toBe(claimed.length);
  });

  it('every lesson belongs to a topic — nothing is stranded', () => {
    const claimed = new Set(TOPICS.flatMap(t => t.lessons));
    const stranded = ALL_LESSONS.filter(l => !claimed.has(l.id)).map(l => l.id);
    expect(stranded, 'lessons in no topic would never appear on the roadmap').toEqual([]);
  });

  it('topic and badge ids are unique', () => {
    const ids = TOPICS.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const badges = [...TOPICS.map(t => t.badge.id), ...MODULES.map(m => m.badge.id)];
    expect(new Set(badges).size, 'two badges share an id').toBe(badges.length);
  });
});

describe('prerequisites are usable data', () => {
  it('every prerequisite id points at a real topic', () => {
    for (const t of TOPICS) {
      for (const p of t.prerequisites) {
        expect(topicById(p), `${t.id} requires "${p}", which does not exist`).toBeDefined();
      }
      for (const n of t.neededFor ?? []) {
        expect(topicById(n), `${t.id} says it is needed for "${n}", which does not exist`).toBeDefined();
      }
    }
  });

  it('no topic requires itself, directly or through a chain', () => {
    // A cycle makes "what should I do next" unanswerable, and nothing else would notice.
    const seen = new Map<string, number>();   // 0 = visiting, 1 = done
    const walk = (id: string, trail: string[]): void => {
      if (seen.get(id) === 1) return;
      expect(seen.get(id), `prerequisite cycle: ${[...trail, id].join(' -> ')}`).not.toBe(0);
      seen.set(id, 0);
      for (const p of topicById(id)?.prerequisites ?? []) walk(p, [...trail, id]);
      seen.set(id, 1);
    };
    for (const t of TOPICS) walk(t.id, []);
  });

  it('every prerequisite comes earlier in teaching order than the topic needing it', () => {
    const position = new Map(TOPICS.map((t, i) => [t.id, i]));
    for (const t of TOPICS) {
      for (const p of t.prerequisites) {
        expect(position.get(p)!, `${t.id} requires ${p}, which is taught later`)
          .toBeLessThan(position.get(t.id)!);
      }
    }
  });

  it('the maths module comes first and needs nothing', () => {
    expect(MODULES[0].id).toBe('prerequisites');
    expect(MODULES[0].order).toBe(0);
    expect(MODULES[0].prerequisites).toEqual([]);
  });

  it('modules are in ascending order and each requires the one before', () => {
    for (let i = 1; i < MODULES.length; i++) {
      expect(MODULES[i].order).toBeGreaterThan(MODULES[i - 1].order);
      expect(MODULES[i].prerequisites, `${MODULES[i].id} should follow ${MODULES[i - 1].id}`)
        .toContain(MODULES[i - 1].id);
    }
  });

  it('difficulty never decreases across the sequence of modules', () => {
    const hardest = MODULES.map(m => Math.max(...m.topics.map(t => t.difficulty)));
    for (let i = 1; i < hardest.length; i++) {
      expect(hardest[i], `module ${MODULES[i].id} is easier than the one before`)
        .toBeGreaterThanOrEqual(hardest[i - 1]);
    }
  });
});

describe('every topic can actually be completed', () => {
  it('has at least one lesson and enough quiz questions to reach its pass mark', () => {
    for (const t of TOPICS) {
      expect(lessonsOfTopic(t).length, `${t.id} has no lessons`).toBeGreaterThan(0);
      const qs = topicQuestions(t);
      expect(qs.length, `${t.id} asks for ${t.quiz.ask} questions but only ${qs.length} exist`)
        .toBe(t.quiz.ask);
      expect(t.quiz.pass, `${t.id} cannot be passed`).toBeLessThanOrEqual(qs.length);
    }
  });

  it('awards the badge only when the lessons are read and the quiz is passed', () => {
    const t = TOPICS[0];
    const lessons = t.lessons;
    const qs = topicQuestions(t);
    const allRight = Object.fromEntries(qs.map(q => [q.id, true]));

    expect(topicProgress(t, [], allRight).earned, 'quiz alone should not earn it').toBe(false);
    expect(topicProgress(t, lessons, {}).earned, 'reading alone should not earn it').toBe(false);
    expect(topicProgress(t, lessons, allRight).earned, 'both halves should earn it').toBe(true);
  });

  it('reports readiness and what is missing', () => {
    const withPrereqs = TOPICS.find(t => t.prerequisites.length > 0)!;
    const cold = topicReadiness(withPrereqs, [], {});
    expect(cold.ready).toBe(false);
    expect(cold.missing.length).toBeGreaterThan(0);
  });

  it('suggests a first topic that needs nothing', () => {
    const first = nextTopic([], {});
    expect(first).toBeDefined();
    expect(topicReadiness(first!, [], {}).ready, 'the first suggestion should be reachable').toBe(true);
  });

  it('unlockedBy is the mirror of prerequisites', () => {
    for (const t of TOPICS) {
      for (const u of unlockedBy(t)) {
        expect(u.prerequisites).toContain(t.id);
      }
    }
  });

  it('earns every badge when everything is done', () => {
    const allLessons = ALL_LESSONS.map(l => l.id);
    const allRight = Object.fromEntries(QUIZZES.map(q => [q.id, true]));
    expect(earnedTopicBadges(allLessons, allRight).length).toBe(TOPICS.length);
  });
});

describe('Module 0 teaches what the quantum content assumes', () => {
  it('covers complex numbers, vectors, matrices and probability', () => {
    const ids = MODULES[0].topics.map(t => t.id);
    for (const need of ['complex-numbers', 'vectors', 'matrices', 'probability']) {
      expect(ids, `Module 0 is missing ${need}`).toContain(need);
    }
  });

  it('every maths topic says which quantum topic needs it', () => {
    for (const t of MODULES[0].topics) {
      expect(t.neededFor?.length, `${t.id} does not say what it is for`).toBeGreaterThan(0);
    }
  });

  it('the first quantum topic requires the maths', () => {
    const sup = topicById('superposition-basics')!;
    expect(sup.prerequisites).toContain('complex-numbers');
    expect(sup.prerequisites).toContain('vectors');
  });

  it('maps a maths lesson back to its topic', () => {
    expect(topicOf('pre-complex')?.id).toBe('complex-numbers');
  });
});
