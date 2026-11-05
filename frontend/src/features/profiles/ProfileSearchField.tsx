import { GroupedOptionList } from "../../components/common/GroupedOptionList";
import type { ProfileSummary } from "../../api";

/** The option id of the "New profile" row; never a profile id. */
export const NEW_PROFILE_OPTION_ID = "__new_profile__";

export interface ProfileSearchFieldProps {
  profiles: readonly ProfileSummary[];
  /** The profile currently open, or `null` while defining a new one. */
  selectedId: string | null;
  /** Name shown in the closed control: the open profile, or the new draft. */
  selectedName: string | null;
  onSelect: (profileId: string) => void;
  onNew: () => void;
  disabled?: boolean;
}

/**
 * `Search profile` from the Figma document: a combobox whose first entry is
 * "New profile" (FE-022 — there is no separate button for it any more).
 *
 * Picking a profile loads its screenshot, regions and classes, so this is a
 * single choice rather than a free-text box: typing filters, it never creates.
 * The closed control shows the name of the open profile.
 */
export function ProfileSearchField({
  profiles,
  selectedId,
  selectedName,
  onSelect,
  onNew,
  disabled = false,
}: ProfileSearchFieldProps) {
  return (
    <GroupedOptionList
      disabled={disabled}
      emptyMessage="No profile matches."
      filterLabel="Search profile"
      groups={[
        {
          id: "start",
          label: "Start",
          options: [{ id: NEW_PROFILE_OPTION_ID, label: "New profile" }],
        },
        {
          id: "profiles",
          label: "Saved profiles",
          options: profiles.map((profile) => ({
            detail: `${String(profile.region_count)} reg · ${String(profile.category_count)} cls`,
            id: profile.id,
            label: profile.name,
          })),
        },
      ]}
      icon="search"
      label="Game profiles"
      mode="single"
      onChange={(ids) => {
        const [first] = ids;
        if (first === NEW_PROFILE_OPTION_ID) {
          onNew();
        } else if (first !== undefined) {
          onSelect(first);
        }
      }}
      placeholder={selectedName ?? "Search profile"}
      selectedIds={selectedId === null ? [] : [selectedId]}
    />
  );
}
