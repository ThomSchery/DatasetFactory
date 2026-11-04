import { GroupedOptionList } from "../../components/common/GroupedOptionList";
import type { ProfileSummary } from "../../api";

export interface ProfileSearchFieldProps {
  profiles: readonly ProfileSummary[];
  /** The profile currently open, or `null` while defining a new one. */
  selectedId: string | null;
  onSelect: (profileId: string) => void;
  disabled?: boolean;
}

/**
 * `Search profile` from the Figma document.
 *
 * Picking a profile is the act that loads its screenshot, its regions and its
 * classes, so this is a single-choice list rather than a free-text box: a name
 * typed here filters, it never creates. The name of the profile that is open
 * stays visible as the selected row, which is what the design asks for — "po
 * wyborze profilu w miejscu Search profile widzę profil który wybrałem".
 */
export function ProfileSearchField({
  profiles,
  selectedId,
  onSelect,
  disabled = false,
}: ProfileSearchFieldProps) {
  return (
    <GroupedOptionList
      disabled={disabled}
      emptyMessage="Żaden profil nie pasuje do wpisanej nazwy."
      filterLabel="Search profile"
      groups={[
        {
          id: "profiles",
          label: "Zapisane profile",
          options: profiles.map((profile) => ({
            detail: `${String(profile.region_count)} reg. · ${String(profile.category_count)} kl.`,
            id: profile.id,
            label: profile.name,
          })),
        },
      ]}
      label="Wybór profilu gry"
      mode="single"
      onChange={(ids) => {
        const [first] = ids;
        if (first !== undefined) {
          onSelect(first);
        }
      }}
      selectedIds={selectedId === null ? [] : [selectedId]}
    />
  );
}
