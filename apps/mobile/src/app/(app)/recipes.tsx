import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import type { RecipeIngredientRow, RecipeWithIngredients } from '@ballistic/shared/data/types';
import { entryMacros } from '@ballistic/shared/utils/foodTotals';
import { amountLabel, MAX_SERVINGS, parseServings, perServing, RECIPE_NAME_MAX, validateRecipeName } from '@ballistic/shared/utils/mealPlan';

import { Pressable } from '@/components/press';
import { FieldLabel, Input } from '@/components/fields';
import { CompleteScanSheet, FoodPickerSheet, QuantitySheet, ScanAmountSheet, ScannerSheet } from '@/components/food';
import { FormsEmpty } from '@/components/forms';
import { Icon } from '@/components/icons';
import { NutritionTabs } from '@/components/pagetabs';
import { AppText, Button, Card, ConfirmSheet, Screen, ScrollScreen, SmallButton } from '@/components/ui';
import { useBarcodeFlow } from '@/lib/barcodeFlow';
import { useAddIngredient, useCreateRecipe, useDeleteRecipe, useRecipes, useRemoveIngredient, useRenameRecipe, useUpdateIngredient, useUpdateServings } from '@/lib/recipes';
import { spacing, useTheme } from '@/theme';

const MACRO_COLORS = { protein: '#a07aff', carbs: '#e8a020', fat: '#2ecc71' };

// A recipe's name can be corrected (RC1). It saves when the box loses focus or the keyboard's Done is pressed; an empty box puts the old
// name back, and nothing is sent when the name did not change.
function RecipeNameField({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [value, setValue] = useState(name);
  function commit() {
    const trimmed = value.trim();
    if (!trimmed) return setValue(name);
    setValue(trimmed);
    if (trimmed !== name) onRename(trimmed);
  }
  return (
    <View style={{ gap: 6, paddingTop: spacing.sm }}>
      <FieldLabel>Name</FieldLabel>
      <Input accessibilityLabel="Recipe name" value={value} maxLength={RECIPE_NAME_MAX} onChangeText={setValue} onBlur={commit} onSubmitEditing={commit} returnKeyType="done" />
    </View>
  );
}

// Recipes: build one once (name, servings, ingredients), then log or plan the whole thing in a couple of taps.
export default function Recipes() {
  const t = useTheme();
  const q = useRecipes();
  const create = useCreateRecipe();
  const del = useDeleteRecipe();
  const addIngredient = useAddIngredient();
  const updateIngredient = useUpdateIngredient();
  const removeIngredient = useRemoveIngredient();
  const updateServings = useUpdateServings();
  const rename = useRenameRecipe();

  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null); // recipe id the ingredient picker is open for
  const [editing, setEditing] = useState<RecipeIngredientRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<RecipeWithIngredients | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [servings, setServings] = useState('1');
  const [nameError, setNameError] = useState<string | null>(null);
  const scan = useBarcodeFlow((food, grams, target) => {
    if (target?.id) addIngredient.mutate({ recipeId: target.id, food, portions: grams });
  });

  if (q.isPending) {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <ActivityIndicator color={t.accent} />
      </Screen>
    );
  }
  if (q.isError) {
    return (
      <Screen style={{ justifyContent: 'center', gap: spacing.md }}>
        <AppText color="danger">Could not load your recipes: {q.error.message}</AppText>
        <Button title="Try again" onPress={() => q.refetch()} />
      </Screen>
    );
  }

  function submit() {
    const problem = validateRecipeName(name);
    setNameError(problem);
    if (problem) return;
    create.mutate(
      { name, servings: parseServings(servings) },
      {
        onSuccess: (id) => {
          setName('');
          setServings('1');
          setCreating(false);
          // Straight into adding ingredients, instead of leaving the member to find the recipe they just made.
          setOpenId(id);
          setAdding(id);
        },
      },
    );
  }

  const error = [create, del, addIngredient, updateIngredient, removeIngredient, updateServings, rename].find((m) => m.isError)?.error?.message;

  return (
    <>
      <ScrollScreen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
        <NutritionTabs current="recipes" />
        {error ? <AppText color="danger" style={{ fontWeight: '600' }}>{error}</AppText> : null}
        {scan.status ? <AppText variant="small" color="muted">{scan.status}</AppText> : null}

        {q.data.length === 0 ? (
          <FormsEmpty icon="chefHat" title="No recipes yet" text="Build a recipe once, then log or plan the whole thing in a couple of taps." />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {q.data.map((r) => {
              const open = openId === r.id;
              const per = perServing(r);
              const count = r.recipe_ingredients.length;
              return (
                <Card key={r.id} style={{ padding: 0 }}>
                  <Pressable onPress={() => setOpenId(open ? null : r.id)} accessibilityRole="button" accessibilityState={{ expanded: open }} aria-expanded={open} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14 }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText style={{ fontWeight: '800', fontSize: 16 }}>{r.name}</AppText>
                      {count > 0 ? (
                        <>
                          <AppText style={{ fontWeight: '700' }}>{Math.round(per.calories)} <AppText variant="small" color="muted">kcal per serving</AppText></AppText>
                          <AppText variant="small" style={{ fontWeight: '600' }}>
                            <AppText variant="small" style={{ color: MACRO_COLORS.protein }}>P {Math.round(per.protein)}g</AppText>{' · '}
                            <AppText variant="small" style={{ color: MACRO_COLORS.carbs }}>C {Math.round(per.carbs)}g</AppText>{' · '}
                            <AppText variant="small" style={{ color: MACRO_COLORS.fat }}>F {Math.round(per.fat)}g</AppText>
                          </AppText>
                        </>
                      ) : (
                        <AppText variant="small" color="muted">No ingredients yet</AppText>
                      )}
                      <AppText variant="small" color="muted">{count} ingredient{count === 1 ? '' : 's'} · makes {r.servings} serving{r.servings === 1 ? '' : 's'}</AppText>
                    </View>
                    <Icon name={open ? 'chevronUp' : 'chevronDown'} size={18} color={t.muted} />
                  </Pressable>

                  {open ? (
                    <View style={{ borderTopWidth: 1, borderTopColor: t.border, paddingHorizontal: 14, paddingBottom: 14, gap: spacing.sm }}>
                      <RecipeNameField key={r.id + ':' + r.name} name={r.name} onRename={(n) => rename.mutate({ recipeId: r.id, name: n })} />
                      {r.recipe_ingredients.map((ing) => (
                        <Pressable key={ing.id} onPress={() => setEditing(ing)} accessibilityRole="button" style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: t.border }}>
                          <View style={{ flex: 1 }}>
                            <AppText style={{ fontWeight: '600' }} numberOfLines={1}>{ing.food?.name ?? 'Unknown food'}</AppText>
                            <AppText variant="small" color="muted">{amountLabel(ing.portions, ing.food)}</AppText>
                          </View>
                          <AppText color="muted">{Math.round(entryMacros(ing).calories)} kcal</AppText>
                        </Pressable>
                      ))}
                      {count === 0 ? <AppText color="muted" style={{ paddingTop: 8 }}>Add the first ingredient to see the calories.</AppText> : null}
                      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: 4 }}>
                        <View style={{ flex: 1 }}><Button title="Add ingredient" variant="secondary" onPress={() => setAdding(r.id)} /></View>
                        <View style={{ width: 96 }}><Button title="Scan" variant="secondary" onPress={() => scan.start({ id: r.id, label: r.name })} /></View>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <AppText variant="small" color="muted" style={{ fontWeight: '700' }}>Makes</AppText>
                          <SmallButton title="−" tone="muted" onPress={() => r.servings > 1 && updateServings.mutate({ recipeId: r.id, servings: r.servings - 1 })} disabled={r.servings <= 1} />
                          <AppText style={{ fontWeight: '800', minWidth: 22, textAlign: 'center' }}>{r.servings}</AppText>
                          <SmallButton title="+" tone="muted" onPress={() => updateServings.mutate({ recipeId: r.id, servings: r.servings + 1 })} disabled={r.servings >= MAX_SERVINGS} />
                          <AppText variant="small" color="muted">serving{r.servings === 1 ? '' : 's'}</AppText>
                        </View>
                        <Pressable onPress={() => setConfirmDelete(r)} accessibilityRole="button" accessibilityLabel="Delete recipe" style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6 }}>
                          <Icon name="trash2" size={16} color={t.danger} />
                          <AppText variant="small" color="danger" style={{ fontWeight: '700' }}>Delete</AppText>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                </Card>
              );
            })}
          </View>
        )}

        {creating ? (
          <Card style={{ gap: spacing.md }}>
            <View style={{ gap: 6 }}>
              <AppText variant="small" style={{ fontWeight: '700' }}>Recipe name</AppText>
              <Input accessibilityLabel="Recipe name" autoFocus value={name} maxLength={RECIPE_NAME_MAX} onChangeText={(v) => { setName(v); setNameError(null); }} placeholder="e.g. Protein overnight oats" />
            </View>
            <View style={{ gap: 6 }}>
              <AppText variant="small" style={{ fontWeight: '700' }}>How many servings does it make?</AppText>
              <Input accessibilityLabel="Servings" keyboardType="number-pad" value={servings} maxLength={3} onChangeText={setServings} />
            </View>
            {nameError ? <AppText color="danger">{nameError}</AppText> : null}
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}><Button title={create.isPending ? 'Creating…' : 'Create & add ingredients'} onPress={submit} loading={create.isPending} /></View>
              <SmallButton title="Cancel" tone="muted" onPress={() => { setCreating(false); setNameError(null); }} />
            </View>
          </Card>
        ) : (
          <Pressable onPress={() => setCreating(true)} accessibilityRole="button" style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.border, borderRadius: 16, paddingVertical: 14, alignItems: 'center' }}>
            <AppText color="muted" style={{ fontWeight: '700' }}>+ New recipe</AppText>
          </Pressable>
        )}
      </ScrollScreen>

      {adding ? (
        <FoodPickerSheet
          title={`Add ingredient · ${q.data.find((r) => r.id === adding)?.name ?? 'Recipe'}`}
          onClose={() => setAdding(null)}
          onAddFood={(food, portions) => addIngredient.mutate({ recipeId: adding, food, portions })}
        />
      ) : null}
      {editing ? (
        <QuantitySheet
          title={editing.food?.name ?? 'Ingredient'}
          food={editing.food}
          initial={editing.portions}
          onClose={() => setEditing(null)}
          onSave={(portions) => { updateIngredient.mutate({ id: editing.id, portions }); setEditing(null); }}
          onRemove={() => { removeIngredient.mutate({ id: editing.id }); setEditing(null); }}
        />
      ) : null}
      {confirmDelete ? (
        <ConfirmSheet
          title={`Delete “${confirmDelete.name}”?`}
          body="This removes the recipe and its ingredient list. It does not affect anything already logged."
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => { del.mutate({ recipeId: confirmDelete.id }); setOpenId((cur) => (cur === confirmDelete.id ? null : cur)); setConfirmDelete(null); }}
        />
      ) : null}
      {scan.scanTarget ? <ScannerSheet onClose={scan.cancelScan} onDetected={scan.handleDetected} /> : null}
      {scan.pending ? <CompleteScanSheet pending={scan.pending} onCancel={scan.cancelPending} onSave={scan.handleComplete} /> : null}
      <ScanAmountSheet scan={scan} />
    </>
  );
}
