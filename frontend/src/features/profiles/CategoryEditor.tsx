import { useState } from "react";

import { Button } from "../../components/common/Button";
import { StatusBadge } from "../../components/common/StatusBadge";
import { TextField } from "../../components/common/TextField";
import { InlineError } from "../../components/common/UiStates";
import { CHARACTER_CLASS_ALPHABET, isDuplicateName, type CategoryValue } from "./schemas";

/*
 * Two kinds of class, and they are not the same kind of input.
 *
 * `kind: "character"` is a base class: one glyph the OCR can return, from the
 * closed alphabet `_CHARACTER_CATEGORIES` in the definition engine. Anything
 * outside it is rejected as `invalid_character_category`, so these are picked
 * from a fixed set rather than typed.
 *
 * `kind: "game"` is a per-game class named by the user — a free-text field,
 * bounded only by length and uniqueness.
 */

export interface CategoryEditorProps {
  categories: readonly CategoryValue[];
  disabled?: boolean;
  error?: string;
  onChange: (categories: CategoryValue[]) => void;
}

export function CategoryEditor({
  categories,
  disabled = false,
  error,
  onChange,
}: CategoryEditorProps) {
  const [gameClassName, setGameClassName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const chosen = new Set(
    categories.filter((category) => category.kind === "character").map((category) => category.name),
  );
  function toggleCharacter(name: string) {
    onChange(
      chosen.has(name)
        ? categories.filter(
            (category) => !(category.kind === "character" && category.name === name),
          )
        : [...categories, { kind: "character", name }],
    );
  }

  function addGameClass() {
    const name = gameClassName.trim();
    if (name === "") {
      setLocalError("Podaj nazwę klasy specyficznej dla gry.");
      return;
    }
    if (isDuplicateName(categories.map((category) => category.name), name)) {
      setLocalError("Klasa o tej nazwie jest już w profilu.");
      return;
    }
    onChange([...categories, { kind: "game", name }]);
    setGameClassName("");
    setLocalError(null);
  }

  function removeCategory(kind: CategoryValue["kind"], name: string) {
    onChange(
      categories.filter((category) => !(category.kind === kind && category.name === name)),
    );
  }

  return (
    <div className="df-profiles__categories">
      <fieldset className="df-profiles__fieldset" disabled={disabled}>
        <legend className="df-profiles__legend">Klasy bazowe</legend>
        <p className="df-profiles__hint">
          Znaki, które OCR może zwrócić. Zaznacz te, które występują w HUD tej gry.
        </p>
        <div className="df-profiles__alphabet">
          {CHARACTER_CLASS_ALPHABET.map((character) => (
            <Button
              aria-pressed={chosen.has(character)}
              key={character}
              onClick={() => {
                toggleCharacter(character);
              }}
              size="sm"
              variant={chosen.has(character) ? "primary" : "muted"}
            >
              {character}
            </Button>
          ))}
        </div>
      </fieldset>

      <div className="df-profiles__game-classes">
        <TextField
          description="Nazwa własna, np. „nazwa gracza” albo „nazwa mapy”."
          disabled={disabled}
          label="Klasa specyficzna dla gry"
          onChange={(event) => {
            setGameClassName(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              // The screen is one big form; Enter here must add a class, not
              // submit a profile the user has not finished describing.
              event.preventDefault();
              addGameClass();
            }
          }}
          value={gameClassName}
          width="short"
        />
        <Button disabled={disabled} onClick={addGameClass} size="sm" variant="secondary">
          Dodaj klasę
        </Button>
      </div>

      {localError === null ? null : <InlineError message={localError} />}

      <ul className="df-profiles__rows">
        {categories.map((category) => (
          <li className="df-profiles__row" key={`${category.kind}-${category.name}`}>
            <div className="df-profiles__row-text">
              <span className="df-profiles__row-name">{category.name}</span>
            </div>
            <div className="df-profiles__row-actions">
              <StatusBadge srLabel="Rodzaj klasy" tone={category.kind === "game" ? "brand" : "neutral"}>
                {category.kind === "game" ? "Per gra" : "Bazowa"}
              </StatusBadge>
              <Button
                aria-label={`Usuń klasę ${category.name}`}
                disabled={disabled}
                onClick={() => {
                  removeCategory(category.kind, category.name);
                }}
                size="sm"
                variant="secondary"
              >
                Usuń
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {error === undefined ? null : <InlineError message={error} />}
    </div>
  );
}
