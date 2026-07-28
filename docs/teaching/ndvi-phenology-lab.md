# When does the Earth turn green?

### A ready-to-run RoamingEye lab on seasonal vegetation phenology

**Nothing to install. No accounts. No fee. Works on a Chromebook.**

This is a complete teaching activity with an instructor guide: learning
objectives, a student worksheet, an assessment rubric, answer notes, and the
mistakes students actually make. It uses one focused idea — the annual cycle of
plant growth, and how it differs between places — as a way into satellite data,
seasonality, anomalies, and data provenance.

Everything runs in a browser at **[roamingeye.org](https://roamingeye.org/)**.

> **Instructors: this activity has not been classroom-tested by us.** It was
> written against the app's actual behaviour and data, but you know your
> students and we do not. Please run it yourself once (15 minutes) before you
> run it with a class — and if you do teach it, [tell us how it
> went](https://github.com/zkWizard/RoamingEye/issues/new?template=feedback.yml).
> Notes from real classrooms are the only way this gets better.

---

## At a glance

|                        |                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| **Level**              | Upper secondary → introductory undergraduate                                                       |
| **Time**               | 60–75 minutes (45- and two-session variants below)                                                 |
| **Format**             | Individual or pairs at a computer; works as a lab, a flipped-classroom homework, or a lecture demo |
| **Subjects**           | Earth/environmental science, geography, biology/ecology, data literacy, intro remote sensing       |
| **Student tech**       | Any modern desktop browser with WebGL. No login, no install, no plugin.                            |
| **Instructor prep**    | ~15 minutes (run it once; pick your sites)                                                         |
| **Cost**               | None. The app is MIT-licensed; the data is public-domain NASA imagery.                             |
| **Optional extension** | A spreadsheet or a few lines of Python for the CSV                                                 |

---

## Learning objectives

By the end of this activity, a student should be able to:

1. **Describe** the annual vegetation cycle at a named location from a
   multi-decade satellite time series — when growth starts, when it peaks,
   when it falls off.
2. **Explain** why two places in opposite hemispheres have vegetation peaks
   about six months apart, and why a tropical rainforest has almost no annual
   cycle at all.
3. **Distinguish** a seasonal cycle from an anomaly, and state in their own
   words what the anomaly has removed and why that is useful.
4. **Read** a data file's provenance header and say which satellite product a
   figure came from, how precise the values are, and how to cite it.
5. **State** one limitation of values reconstructed from imagery, and one way
   a scientist would check them.

Objectives 3–5 are the data-literacy core. They transfer to any dataset the
student meets later; the vegetation cycle is the vehicle.

## Prerequisites

Students should be comfortable reading a line graph with time on the x-axis.
Nothing else is assumed — not GIS, not coding, not prior remote sensing.

Useful but optional prior knowledge: that seasons are caused by axial tilt, and
that the hemispheres are out of phase. If they have not met this, the lab
teaches it — Part D lands the point hard, and many students find seeing it in
real data more convincing than being told.

## What NDVI is (one paragraph you can read aloud)

Healthy plants absorb red light for photosynthesis and strongly reflect
near-infrared light. NDVI — the Normalized Difference Vegetation Index —
compares those two, giving roughly **0 for bare ground, rock, sand or snow, and
up to about 1 for dense green canopy**. A satellite measures it for every
kilometre of land, every month. Scrubbing that record through time is watching
the planet's plants breathe in and out.

This lab uses NASA's **MOD13A3** monthly NDVI product from the MODIS instrument
on the Terra satellite — a continuous record from **March 2000 to the present**,
about 26 years.

---

## Before class — instructor prep

**1. Run the lab yourself once.** Fifteen minutes. It is the single highest-value
thing you can do, and it means you will have seen exactly what your students see.

**2. Pick your sites.** Part D compares places with contrasting vegetation
cycles. Use the suggested set, or swap in somewhere local — a site your students
know is worth more than a famous one they do not.

The suggested set, and what makes each one do its job:

| Site                                                                                                              | Why it is on the list                                    | What to expect                                                                  |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **A temperate deciduous forest** — e.g. Vermont, USA, or central Germany                                          | The clean textbook case                                  | A strong, regular annual cycle: low in winter, high in summer                   |
| **Equatorial rainforest** — e.g. near Manaus, Brazil                                                              | Breaks the "everywhere has seasons" assumption           | High values year-round with little annual swing — and cloud-driven gaps         |
| **Southern-hemisphere farmland or grassland** — e.g. the Pampas, Argentina, or the Canterbury Plains, New Zealand | The hemisphere flip — the moment the lab is built around | A clear cycle peaking in the _southern_ summer, roughly opposite the first site |
| **Optional fourth: a monsoon or semi-arid site** — e.g. the Sahel near Niamey, Niger                              | Shows a single sharp pulse tied to a rainy season        | Near-bare most of the year, one short green surge                               |

> These are qualitative expectations grounded in well-established plant
> phenology, not values we measured for you. Confirm them at your chosen
> coordinates during prep — that is what step 1 is for.

**3. Know the one dead end.** The point probe currently returns **no data** for
the _Land surface temp_ layer — a known bug, tracked as
[#170](https://github.com/zkWizard/RoamingEye/issues/170) and documented in
[METHODS.md §3](../../METHODS.md). If a curious student wanders onto that layer
and clicks, they will get an empty chart and think they broke something. Tell
them in advance, or use it as a teachable moment about known limitations being
published rather than hidden. **The Vegetation (NDVI) layer this lab uses works
fine.**

**4. Decide whether to do Part E.** The provenance/CSV section is the most
valuable part for a methods or data-literacy course and the most skippable for a
short session.

---

## The lab

### Part A — Watch the planet breathe (10 min)

1. Open **[roamingeye.org](https://roamingeye.org/)**.
2. In the layer picker, choose **Vegetation (NDVI)**.
3. Drag the timeline at the bottom of the screen slowly through a few years.
   Use the **← / →** arrow keys to step one month at a time — smoother than
   dragging, and much easier to see the pattern.
4. Rotate the globe to look at the Northern Hemisphere, then the Southern.

**Ask before anyone touches a chart:** _What is moving, and which way?_ Let
students describe the green band sweeping north and south before you name it.
The pattern is obvious once seen and nearly invisible if you announce it first.

> **Keyboard shortcuts worth putting on the board:** **← / →** step one month,
> **Page Up / Page Down** jump a whole year (same month, next year — ideal for
> comparing like with like), **Home / End** jump to the start or end of the
> record.

### Part B — One place, twenty-six years (20 min)

1. Search for your first site, or rotate and zoom to it.
2. **Click the point.** The probe panel opens and charts NDVI at that exact
   spot for every month since March 2000.
3. Make sure the **Sampling** toggle is on **Point** and the **View** toggle is
   on **Values**.

Now have students read the chart and answer worksheet questions 1–4. The goal
is description, not explanation: _when_ is it high, _when_ is it low, _how
regular_ is it, _are there gaps_.

The gaps matter. Months with no usable data appear as breaks in the line —
usually persistent cloud. Do not smooth over this; it is what real data looks
like.

### Part C — Separating the season from the year (15 min)

Switch the **View** toggle from **Values** to **Anomaly**.

The chart now shows, for each month, _how far that month sat from the average
of the same calendar month across the whole record_. Every July is compared
only against other Julys.

**This is the conceptual heart of the lab.** The seasonal cycle — the thing
that dominated the Values chart — is now gone, and what remains is the part
that makes each year different from the others. Give it a couple of minutes;
students often need to flip back and forth between the two views before it
clicks.

Worksheet questions 5–7 cover this. The key question is question 7: _why would
a scientist studying drought want the anomaly rather than the raw values?_

### Part D — Three places, three different years (20 min)

Repeat Part B at each of your chosen sites, sketching or screenshotting the
shape each time.

Then put the shapes side by side and ask the questions that make the comparison
pay off:

- Which two sites are roughly **mirror images** in time? Why?
- Which site barely has a cycle at all? What does that say about its climate?
- If you only had these three curves and no labels, could you say which
  hemisphere each site is in?

This is where objective 2 lands. A student who works out the hemisphere flip
from the data will not forget it.

### Part E — Where did this number come from? (10 min, optional)

Click **Download CSV** in the probe panel, and open the file in a text editor
(not a spreadsheet — the point is to see the top of the file).

Above the data, every export carries its own provenance:

```
# RoamingEye point probe — APPROXIMATE values
# method: colormap inversion of NASA GIBS rendered imagery ...
# caveat: reconstructed from public imagery colors; use the underlying L3 product for measurement-grade work
# layer: Vegetation (NDVI)
# gibs_layer: MODIS_Terra_L3_NDVI_Monthly
# data_product: MOD13A3 v061 — MODIS/Terra Vegetation Indices Monthly L3 Global 1km
# data_doi: https://doi.org/10.5067/MODIS/MOD13A3.061
# lat: ...
# lon: ...
# value: NDVI (approx.) (approximate physical scale)
# anomaly: value minus this location's mean for the same calendar month (same units)
# uncertainty: ±0.002 colormap quantization ...
# view_url: ...
year_month,value,anomaly
```

Then ask: **what would you have to write down for someone else to reproduce
this exactly?** Everything needed is in that header — the product, its DOI, the
coordinates, the uncertainty, and a URL that restores the exact view.

Most datasets students meet in their lives will not tell them this much. That
is the lesson: _good data says where it came from and how much to trust it._

---

## Student worksheet

> Copy this block into your LMS, or print it. Answers in the next section.

**Your site:** ____________________ **Lat/lon:** ____________________

1. In which month does NDVI usually reach its **highest** value at your site?
2. In which month is it **lowest**?
3. Roughly how much does it change between those two — a little, or more than
   half the scale?
4. Are there months with **no data**? Where in the year do they fall, and what
   do you think causes them?
5. Switch to the **Anomaly** view. What happened to the regular up-and-down
   pattern, and why?
6. Find a year that stands out as unusually **low** in the anomaly view. Which
   year is it?
7. A scientist is studying whether a drought hurt this region. Why would they
   want the **anomaly** chart rather than the **values** chart?
8. Compare your three sites. Which two are roughly opposite in time, and what
   causes that?
9. Which site has almost no seasonal cycle? What does that tell you about its
   climate?
10. Open the CSV header. Which NASA product did these numbers come from, and
    what does the file say about how **precise** they are?

---

## Assessment

A compact rubric. Questions 1–4 test reading; 5–7 test the central concept;
8–9 test transfer; 10 tests provenance.

| Criterion                             | Full marks                                                                                                         | Partial                                                             | Not yet                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Reads the record** (Q1–4)           | Names peak and trough months, describes the amplitude, and notices data gaps                                       | Gets peak/trough but treats gaps as zeros or ignores them           | Misreads the time axis or the direction of the cycle        |
| **Seasonal cycle vs. anomaly** (Q5–7) | Says the anomaly removes the average seasonal pattern so unusual years stand out                                   | Describes what the chart looks like without saying what was removed | Treats the anomaly as "a smaller version of the same graph" |
| **Explains the contrast** (Q8–9)      | Attributes the six-month offset to hemispheres/axial tilt; links low seasonality to a wet, warm equatorial climate | Identifies the pattern but cannot account for it                    | Assumes all sites should look the same                      |
| **Provenance** (Q10)                  | Names MOD13A3 and its DOI, and quotes the stated uncertainty                                                       | Finds the product but not the uncertainty, or vice versa            | Cannot locate the information                               |

**A good extension question, if you want one that separates the top of the
class:** _These values were reconstructed from a picture of the data, not from
the data itself. Give one reason that might matter, and one thing you could do
to check._

---

## Instructor answer notes

**Q1–3.** For a Northern-Hemisphere temperate site, expect a peak around
mid-summer (roughly June–August) and a trough in mid-winter, with a large swing.
For an equatorial rainforest, expect consistently high values with a small
swing. For a Southern-Hemisphere site, expect the peak in the southern summer
(roughly December–February).

**Q4 — data gaps.** Persistent cloud is the usual cause, so gaps cluster in wet
seasons; at high latitudes, low winter sun contributes too. In the Amazon, gaps
in the wet season are expected and are a genuinely good discussion point:
_the satellite cannot see through cloud, so the record is not equally reliable
in every month._

**Q5–7 — the central concept.** The anomaly subtracts each month's own long-term
average for that calendar month, so the repeating seasonal shape cancels out and
only the departures remain. A drought researcher wants this because a July that
is low _for a July_ is invisible in the raw chart — July is always high — but
obvious in the anomaly. This idea (removing a known cycle to reveal what is
left) recurs throughout climate science.

**Q8–9 — the hemisphere flip.** Axial tilt puts the hemispheres in opposite
seasons, so growing seasons are about six months apart. The equatorial site has
little cycle because temperature and daylight barely vary there — growth is
limited by other things, not by season.

**Q10 — provenance.** MOD13A3 v061, DOI `10.5067/MODIS/MOD13A3.061`. The header
states an uncertainty of about **±0.002 NDVI** from colormap quantization, and
says plainly that values are approximate and reconstructed from imagery.

### Common confusions — worth pre-empting

- **"The forest died in December."** A winter NDVI collapse at a deciduous site
  is leaf fall, not death. Snow reads as low NDVI too, which compounds it.
- **Empty cells become zeros.** In the CSV, a month with no data is an _empty_
  value, not a zero. Spreadsheets frequently plot those as zeros, producing
  dramatic fake crashes to the bottom of the chart. If students take the CSV
  into Excel or Sheets, warn them explicitly — this is the single most common
  way the exercise goes wrong.
- **"Anomaly near zero means nothing is growing."** It means the month was
  _typical_ for that month. Zero anomaly at a July peak is a perfectly normal,
  very green July.
- **Clicking the ocean, or a cloudy month.** Returns no data, correctly. Not a
  bug.
- **Comparing absolute NDVI between wildly different biomes.** The _shape and
  timing_ comparisons in Part D are robust; treating small absolute differences
  between a rainforest and a wheat field as meaningful is not. See the limits
  below.
- **Expecting to zoom to individual trees on this layer.** The NDVI product is
  about 1 km per pixel. Zooming further does not add vegetation detail.
- **"Approximate" heard as "wrong."** Worth saying out loud: approximate means
  the uncertainty is known and stated, which is the opposite of untrustworthy.

---

## Honest limits — and why they are part of the lesson

RoamingEye reconstructs values by **inverting the colours of rendered satellite
imagery**, not by reading the underlying science files. That has real
consequences, and the project states them rather than hiding them:

- **Values are approximate.** For NDVI the colour-step quantization alone is
  about ±0.002, stated in every export.
- **NDVI's end-to-end inversion accuracy has not been measured** the way it has
  for the six layers benchmarked in [METHODS.md §3](../../METHODS.md). So treat
  absolute NDVI here as _indicative_. **Timing, shape, and relative
  comparisons — which is all this lab asks for — are what the method is good
  at.** That is a deliberate design choice for this activity, not a
  coincidence.
- **The Land surface temp probe returns no data at present** ([#170](https://github.com/zkWizard/RoamingEye/issues/170)).
- **Different layers start in different years**, so any comparison across layers
  should use the window they share.
- **This is not measurement-grade.** For a thesis result, follow the DOI in the
  CSV header to the L3 product and pull the real granules. Deciding _whether a
  site is worth that effort_ is exactly what this tool is for.

For students, that list is not a disclaimer to skip past — it is a worked
example of how honest science communicates. Most of the data they will meet
online tells them none of it.

---

## Variants

**45-minute version.** Parts A, B, C. Assign Part D as homework with a single
extra site.

**Two-session version.** Session 1: Parts A–D. Session 2: students pick their
own site, form a hypothesis about its cycle _before_ probing it, test it, and
present the result. The prediction-first structure turns the lab into genuine
inquiry.

**Lecture demo (10 min).** Part A on the projector, then a single probe at a
site your students know, then the Values → Anomaly flip. The URL in the address
bar encodes the exact view, so you can paste a link into your slides or LMS that
restores it for everyone.

**Data-heavy extension.** The CSV loads into pandas in three lines; the
[research recipes](../research-recipes.md) show the pattern for a seasonal
anomaly, and are a good bridge for students moving on to a methods course.

---

## Reuse, license, and citation

RoamingEye is **MIT-licensed** and its imagery is **public-domain NASA data**.
This guide is part of the repository and carries the same license: adapt it,
translate it, put it in a course pack, change the sites — no permission needed.

If you cite the tool, see [How to cite](../../README.md#-how-to-cite). If you
publish a figure from it, cite the _dataset_ DOI from the CSV header, not just
the app — that is NASA's guidance and it is good practice.

**If you teach this, we would genuinely like to know.** What worked, what
confused people, what you had to change, how long it actually took.
[Feedback form](https://github.com/zkWizard/RoamingEye/issues/new?template=feedback.yml)
— three questions, rough notes welcome. Instructor feedback shapes the
[roadmap](../../ROADMAP.md).
