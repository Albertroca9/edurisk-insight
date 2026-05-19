# Intervention Impact Analysis Framework

## Overview

This framework measures the effectiveness of interventions (extra lectures, tutoring, support programs) provided to at-risk students by comparing their dropout risk predictions **before interventions** and **6 months after** receiving support.

**Goal**: Quantify whether interventions actually reduce student dropout risk.

---

## Project Structure

```
Source/
├── Intervention_Analysis/          # ← NEW: Intervention analysis module
│   ├── intervention_impact_analysis.ipynb
│   ├── intervention_analysis.py
│   └── README.md                    # ← This file
├── Classificació supervisada/       # Your existing classification
│   └── supervised_learning.ipynb
└── ...

InterventionData/                    # ← NEW: Data storage directory
├── intervention_recipients_baseline.csv
├── followup_data_template.csv
├── followup_data_6m.csv             # ← Will be created when you add data
└── metadata.json
```

---

## Workflow

### Phase 1: Initial Setup (What We've Done)

1. **Identified intervention recipients**: All students with `dropout = 1` in baseline data
2. **Created data template**: Structure for 6-month follow-up data collection
3. **Set up analysis framework**: Functions to compare before/after predictions

### Phase 2: Data Collection (Your Action)

**Timeline**: 6 months after initial intervention

After students have received interventions (extra lectures, tutoring, etc.):

1. **Collect updated student features** for each intervention recipient
2. **Record intervention details**:
   - Type of intervention (extra lectures, tutoring, mentoring, etc.)
   - Total hours of intervention provided
   - Student attendance rate
   
3. **Record actual outcomes**:
   - Did the student actually dropout or continue? (0 = continued, 1 = dropped out)

### Phase 3: Analysis & Results

1. **Generate new predictions** using your XGBoost model on 6-month data
2. **Compare predictions**:
   - Baseline risk (pre-intervention)
   - Follow-up risk (6 months after intervention)
3. **Calculate impact metrics**:
   - % of students who improved
   - % of students who worsened
   - Average risk reduction
   - Success rate of interventions

---

## Data Files

### 1. Intervention Recipients Baseline
**File**: `InterventionData/intervention_recipients_baseline.csv`

All at-risk students identified for intervention (from your classification model):

```
Hours_Studied, Attendance, ..., Exam_Score, student_id
23,84,"Low",...,67,0
19,64,"Low",...,61,1
...
```

### 2. Follow-up Data Template
**File**: `InterventionData/followup_data_template.csv`

**Instructions**: Fill in this template with 6-month data for each student:

| Column | Description | Example |
|--------|-------------|---------|
| `student_id` | Student identifier | 0, 1, 2, ... |
| `Hours_Studied_6m` | Hours studied at 6-month mark | 25 |
| `Attendance_6m` | Attendance rate at 6 months | 90 |
| `Exam_Score_6m` | New exam score after 6 months | 72 |
| ... | (all original features + `_6m` suffix) | ... |
| `intervention_type` | Type of support provided | "Extra_Lectures", "Tutoring", "Combined" |
| `intervention_hours` | Total intervention hours provided | 20 |
| `intervention_attendance` | Student's intervention attendance rate (0-1) | 0.85 |
| `actual_dropout_6m` | Did student actually dropout? | 0 or 1 |

---

## How to Use

### Option A: Using Python Script

```python
from intervention_analysis import InterventionAnalysis

# Initialize
analyzer = InterventionAnalysis()

# Load baseline
analyzer.load_baseline_data()
recipients = analyzer.get_intervention_recipients()

# When you have 6-month data:
followup_df = pd.read_csv('InterventionData/followup_data_6m.csv')

# Generate predictions (requires XGBoost model)
analyzer.load_xgboost_model()
baseline_probs = analyzer.predict_dropout_risk(recipients)
followup_probs = analyzer.predict_dropout_risk(followup_df)

# Compare results
comparison = analyzer.compare_results(baseline_probs, followup_probs)
metrics = analyzer.calculate_metrics(comparison)

# Print report
report = analyzer.generate_report(metrics, comparison)
print(report)

# Save results
analyzer.save_comparison_results(comparison, metrics)
```

### Option B: Using Jupyter Notebook

See `intervention_impact_analysis.ipynb` for complete interactive analysis with:
- Data loading and exploration
- Prediction and comparison
- Visualizations (risk probability changes, outcomes distribution)
- Detailed metrics and reporting

---

## Output Metrics

### Individual Student Level

For each student:
- **Baseline risk probability**: Pre-intervention dropout risk
- **Follow-up risk probability**: Post-intervention dropout risk
- **Risk change**: Difference (negative = improvement)
- **Status**: Improved / Worsened / Stable
- **Outcome**: Actual dropout or continued enrollment

### Aggregate Level

- **Improvement rate**: % of students with reduced risk
- **Deterioration rate**: % of students with increased risk
- **Mean risk change**: Average change across all students
- **Success rate**: How many interventions "worked"?

### Example Report Output

```
======================================================================
                   INTERVENTION IMPACT ANALYSIS REPORT
======================================================================

📊 SUMMARY
  Total students in intervention group: 1,245
  Analysis date: 2026-11-19

✅ IMPROVEMENT OUTCOMES
  Students improved:  892 (71.6%)
  Students worsened:  187 (15.0%)
  Students stable:    166 (13.3%)

📈 RISK METRICS
  Average baseline risk:    0.725
  Average follow-up risk:   0.518
  Mean risk change:         -0.207
  Median risk change:       -0.185

🎯 CONCLUSION: Interventions appear EFFECTIVE
   Average risk has decreased across the intervention group.
```

---

## Risk Categories

Students are classified by dropout risk:

- **Low Risk**: Probability < 0.33 (33%)
- **Medium Risk**: Probability 0.33 - 0.67
- **High Risk**: Probability > 0.67

Transitions are tracked (e.g., High Risk → Medium Risk).

---

## Integration with Existing System

This analysis fits into your IDSS workflow:

```
Data Collection
    ↓
[Preprocessing]
    ↓
[Classification with XGBoost] ← Current stage
    ↓
[Identify at-risk students]
    ↓
Intervention Delivered
    (6 months pass)
    ↓
[Follow-up data collection]
    ↓
[Intervention Impact Analysis] ← You are here
    ↓
[Generate Impact Report]
    ↓
[Update CBR Case Base with outcomes]
    ↓
[Improve recommendations for next cycle]
```

---

## Files Generated

After running the analysis, you'll have:

1. **intervention_comparison_[timestamp].csv**
   - Detailed before/after comparison for each student

2. **intervention_comparison_[timestamp]_metrics.json**
   - Aggregate metrics and summary statistics

3. **Visualizations** (in notebook):
   - Risk probability changes
   - Outcome distribution charts
   - Risk category transition matrix

---

## Important Notes

⚠️ **Data Quality**:
- Ensure 6-month data uses the same feature definitions as baseline
- Verify that all student IDs match between baseline and follow-up
- Handle missing values consistently

⚠️ **Model Requirements**:
- Your XGBoost model must be saved and loadable
- Feature scaler must be consistent with model training

✅ **Best Practices**:
- Document which features changed most for improved students
- Compare improvement rates across different intervention types
- Track which students benefited most from specific interventions

---

## Next Steps

1. ✅ Set up data collection process for 6-month follow-up
2. ✅ Document intervention details (type, hours, who received them)
3. ⏳ Collect follow-up data after 6 months
4. ⏳ Fill in the template CSV with follow-up data
5. ⏳ Run the analysis notebook/script
6. ⏳ Generate impact report
7. ⏳ Update your CBR system with learned outcomes

---

## Contact & Support

For questions about this framework, refer to:
- `intervention_impact_analysis.ipynb` - Full analysis workflow
- `intervention_analysis.py` - Python module documentation
- `resultats_models_classificacio.csv` - Your baseline classification results

