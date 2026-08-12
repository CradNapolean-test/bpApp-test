-- Recipes previously had no notion of "how many servings does this make" -- logging a recipe
-- scaled the entire ingredient list by the servings input (treating it as "1 batch"), instead
-- of scaling by a fraction of the recipe's own serving size like MyFitnessPal does. Default 1
-- keeps every existing recipe's current logging behaviour unchanged until a coach/client edits
-- the servings field.
alter table recipes add column servings integer not null default 1;
