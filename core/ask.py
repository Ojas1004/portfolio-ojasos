"""Ask Ojas: question answering by TF-IDF retrieval (scikit-learn, no LLM).

Each knowledge entry is a {title, text} pair. At startup we fit a TF-IDF
vectorizer over the entries once; each question is vectorised with the same
vocabulary and compared to every entry by cosine similarity. The best entry
is the answer. If its score is below a threshold we return a polite fallback
instead of a confidently wrong answer.
"""

import json
import re
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, TfidfVectorizer
from sklearn.metrics.pairwise import linear_kernel

DEFAULT_THRESHOLD = 0.08
MAX_QUESTION = 300

# Words that carry meaning for this domain even though sklearn lists them as stop words.
_KEEP = {"work", "find", "call", "contact", "system", "show"}
_STOP = (ENGLISH_STOP_WORDS - _KEEP) | {"ojas", "tell", "know", "like", "does", "did", "use", "using", "used", "best", "way", "good", "really", "probably", "want"}
_TOKEN = re.compile(r"[a-z0-9]+(?:[+#]+)?")

# A few synonyms so common phrasings land on the right entry.
_SYNONYMS = {
    "cv": "resume",
    "built": "build",
    "building": "build",
    "intern": "internship",
    "interned": "internship",
    "interning": "internship",
    "email": "contact",
    "mail": "contact",
    "reach": "contact",
    "hire": "internship",
    "job": "internship",
    "uni": "university",
    "college": "university",
    "study": "education",
    "studying": "education",
    "degree": "education",
    "hobby": "hobbies",
    "ml": "machine learning",
    "ai": "machine learning",
    "js": "javascript",
    "website": "ojasos",
    "site": "ojasos",
    "portfolio": "ojasos",
}

_SMALL_TALK = [
    (re.compile(r"^(hi|hello|hey|hiya|yo|sup|howdy|greetings|good (morning|afternoon|evening))\b[\s!.?]*\w{0,10}[\s!.?]*$"),
     "Hey! I'm Ojas (well, a TF-IDF index of me). Ask about my projects, skills or how to contact me."),
    (re.compile(r"^(thanks|thank you|thx|ty|cheers)\b"),
     "You're welcome! Anything else you'd like to know?"),
    (re.compile(r"^(who|what) are you\b"),
     "I'm Ask Ojas: a small retrieval engine running in Flask with scikit-learn. I search a knowledge base about Ojas and return the closest answer."),
]

# Questions TF-IDF can't answer well: "Who is Ojas" is all stop words (and "ojas"
# is ignored on purpose), and "how does this site work" leans on the word "work",
# which pulls in the Ask Ojas entry. These go straight to the right entry.
_INTENTS = [
    (re.compile(r"^(who\s*(is|'s)\s+(ojas|he|this)\b|who are you,? ojas|about (ojas|you|yourself|him)\b"
                r"|tell me (more )?about (yourself|ojas|you|him)\b|introduce yourself|describe yourself)"),
     "Who is Ojas"),
    (re.compile(r"\bhow (does|do|did|is|was) (this|the|your) (site|website|portfolio|page|desktop|os)\b"
                r"|\bhow (was|is) (this|the|your) (site|website|portfolio) (built|made|created)\b"
                r"|\bwhat is (this|ojasos)\b"),
     "Project: OjasOS (this website)"),
]

FALLBACK = (
    "Sorry, I don't have a good answer to that one. "
    "Try asking about my projects, skills, education, resume or how to contact me. "
    "Or send me a message with the Contact app and I'll reply personally."
)
DEFAULT_SUGGESTIONS = ["Skills overview", "Projects overview", "Contact"]


def _stem(word):
    """Very small suffix stripper: projects->project, libraries->library."""
    if len(word) > 4 and word.endswith("ies"):
        return word[:-3] + "y"
    if len(word) > 3 and word.endswith("s") and not word.endswith(("ss", "us", "is")):
        return word[:-1]
    return word


def _norm_title(text):
    """'Project: OjasOS (this website)?' -> 'ojasos this website' (chips drop the 'Project:' prefix)."""
    text = re.sub(r"^project:\s*", "", str(text).strip().lower())
    return " ".join(re.findall(r"[a-z0-9+#]+", text))


def analyze(text):
    """Tokenise, normalise synonyms, drop stop words, stem, add bigrams."""
    words = []
    text = re.sub(r"\b(next|node)\.?js\b", r"\1js", text.lower())  # "Next.js" -> "nextjs"
    for tok in _TOKEN.findall(text):
        for w in _SYNONYMS.get(tok, tok).split():
            if w not in _STOP and len(w) > 1:
                words.append(_stem(w))
    return words + [f"{a} {b}" for a, b in zip(words, words[1:])]


class KnowledgeBase:
    def __init__(self, entries, threshold=DEFAULT_THRESHOLD):
        if not entries:
            raise ValueError("knowledge base is empty")
        for i, e in enumerate(entries):
            if not isinstance(e, dict) or not str(e.get("title", "")).strip() or not str(e.get("text", "")).strip():
                raise ValueError(f"knowledge entry {i} needs non-empty 'title' and 'text'")
        self.entries = entries
        self.threshold = threshold
        self.titles = [e["title"] for e in entries]
        # exact-title lookup: the chat's suggestion chips send an entry's title as the question
        self.by_title = {_norm_title(t): i for i, t in enumerate(self.titles)}
        # The title is repeated so it weighs a little more than body text.
        docs = [f"{e['title']} {e['title']} {e['text']}" for e in entries]
        self.vectorizer = TfidfVectorizer(analyzer=analyze, sublinear_tf=True)
        self.matrix = self.vectorizer.fit_transform(docs)  # sparse, L2-normalised rows

    @classmethod
    def from_file(cls, path, **kwargs):
        with open(Path(path), encoding="utf-8") as fh:
            return cls(json.load(fh), **kwargs)

    def scores(self, question):
        vec = self.vectorizer.transform([question])
        return linear_kernel(vec, self.matrix).ravel()  # cosine similarity (rows are normalised)

    def ask(self, question):
        """Return {answer, source, score, matched, related}."""
        q = " ".join(str(question).split())[:MAX_QUESTION]
        low = q.lower()

        for pattern, reply in _SMALL_TALK:
            if pattern.search(low):
                return {"answer": reply, "source": None, "score": 1.0, "matched": True, "related": DEFAULT_SUGGESTIONS}

        scores = self.scores(q)

        # a suggestion chip (exact entry title) or a known phrasing picks its entry directly
        forced = self.by_title.get(_norm_title(q))
        if forced is None:
            forced = next((self.by_title.get(_norm_title(t)) for p, t in _INTENTS if p.search(low)), None)
        if forced is not None:
            order = [forced] + [int(i) for i in np.argsort(scores)[::-1] if int(i) != forced]
            related = [self.titles[i] for i in order[1:4] if scores[i] >= self.threshold / 2]
            if not related:
                related = [t for t in DEFAULT_SUGGESTIONS if t != self.titles[forced]]
            return {"answer": self.entries[forced]["text"], "source": self.titles[forced],
                    "score": 1.0, "matched": True, "related": related}

        order = np.argsort(scores)[::-1]
        best = int(order[0])
        best_score = float(scores[best])

        if best_score < self.threshold:
            return {"answer": FALLBACK, "source": None, "score": round(best_score, 3), "matched": False,
                    "related": DEFAULT_SUGGESTIONS}

        related = [self.titles[i] for i in order[1:4] if scores[i] >= self.threshold / 2]
        if not related:
            related = [t for t in DEFAULT_SUGGESTIONS if t != self.titles[best]]
        return {
            "answer": self.entries[best]["text"],
            "source": self.titles[best],
            "score": round(best_score, 3),
            "matched": True,
            "related": related,
        }
