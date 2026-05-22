"""
Intervention Impact Analysis - Data Processing Module
======================================================

This module handles the complete intervention impact analysis workflow:
1. Load baseline student data (pre-intervention profiles)
2. Process 6-month follow-up data
3. Generate dropout risk predictions for both periods
4. Compare results and create impact metrics

Author: PAID Lab
Date: May 2026
"""

import pandas as pd
import numpy as np
from pathlib import Path
from typing import Tuple, Dict, List
import json
import joblib
from datetime import datetime


class InterventionAnalysis:
    """
    Manages intervention impact assessment for at-risk students.
    
    Attributes:
        base_path: Root directory of the project
        intervention_path: Directory for intervention data storage
        model: Pre-trained XGBoost model for risk prediction
        scaler: Feature scaler for preprocessing
    """
    
    def __init__(self, base_path: str = None):
        """Initialize intervention analysis."""
        if base_path is None:
            base_path = '/home/oriol-ms/IA-Universitat/PAID/PAID-Lab/PW234-PAID-2026-T6-StudentDropout'
        
        self.base_path = Path(base_path)
        self.data_path = self.base_path / 'Data'
        self.intervention_path = self.base_path / 'InterventionData'
        self.models_path = self.base_path / 'Models'
        
        # Create intervention directory
        self.intervention_path.mkdir(exist_ok=True)
        
        self.model = None
        self.scaler = None
        self.df_baseline = None
        self.df_followup = None
        
    def load_baseline_data(self) -> pd.DataFrame:
        """
        Load preprocessed baseline student data.
        
        Returns:
            DataFrame with all student baseline features
        """
        baseline_path = self.data_path / 'student_preprocessed.csv'
        self.df_baseline = pd.read_csv(baseline_path)
        return self.df_baseline
    
    def get_intervention_recipients(self) -> pd.DataFrame:
        """
        Extract at-risk students (intervention recipients).
        
        Returns:
            DataFrame of students with dropout = 1 (at-risk)
        """
        if self.df_baseline is None:
            self.load_baseline_data()
        
        recipients = self.df_baseline[self.df_baseline['dropout'] == 1].copy()
        recipients['student_id'] = range(len(recipients))
        
        return recipients
    
    def create_followup_template(self, recipients_df: pd.DataFrame) -> pd.DataFrame:
        """
        Create a template for 6-month follow-up data collection.
        
        Args:
            recipients_df: DataFrame of intervention recipients
            
        Returns:
            Template DataFrame for follow-up data
        """
        template = recipients_df.copy()
        
        # Rename columns to indicate 6-month measurement
        cols = {col: f'{col}_6m' if col != 'student_id' else col 
               for col in template.columns}
        template.rename(columns=cols, inplace=True)
        
        # Add intervention tracking columns
        template['intervention_type'] = ''
        template['intervention_hours'] = 0
        template['intervention_attendance'] = 0.0
        template['actual_dropout_6m'] = None
        
        return template
    
    def load_xgboost_model(self, model_path: str = None):
        """Load pre-trained XGBoost model and scaler."""
        if model_path is None:
            # Try to auto-detect model files
            model_files = list(self.models_path.glob('*xgboost*'))
            if model_files:
                model_path = model_files[0]
            else:
                raise FileNotFoundError(f"No XGBoost model found in {self.models_path}")
        
        self.model = joblib.load(model_path)
        print(f"✓ Model loaded from {model_path}")
    
    def load_scaler(self, scaler_path: str = None):
        """Load feature scaler."""
        if scaler_path is None:
            scaler_files = list(self.models_path.glob('*scaler*'))
            if scaler_files:
                scaler_path = scaler_files[0]
            else:
                print("⚠️ No scaler found. Using None.")
                return
        
        self.scaler = joblib.load(scaler_path)
        print(f"✓ Scaler loaded from {scaler_path}")
    
    def predict_dropout_risk(self, df: pd.DataFrame) -> np.ndarray:
        """
        Generate dropout risk predictions for students.
        
        Args:
            df: DataFrame with student features
            
        Returns:
            Array of dropout probabilities (0-1)
        """
        if self.model is None:
            raise ValueError("Model not loaded. Call load_xgboost_model first.")
        
        # Get feature columns (exclude student_id, dropout, etc.)
        feature_cols = [col for col in df.columns 
                       if col not in ['student_id', 'dropout', 'dropout_6m']]
        
        X = df[feature_cols].copy()
        
        # Scale if scaler available
        if self.scaler is not None:
            X_scaled = self.scaler.transform(X)
        else:
            X_scaled = X
        
        # Get probabilities for dropout class (class 1)
        probabilities = self.model.predict_proba(X_scaled)[:, 1]
        
        return probabilities
    
    def categorize_risk(self, probability: float) -> str:
        """
        Convert probability to risk category.
        
        Args:
            probability: Dropout probability (0-1)
            
        Returns:
            Risk category: 'Low Risk', 'Medium Risk', or 'High Risk'
        """
        if probability < 0.33:
            return 'Low Risk'
        elif probability < 0.67:
            return 'Medium Risk'
        else:
            return 'High Risk'
    
    def compare_results(self, 
                       baseline_probs: np.ndarray, 
                       followup_probs: np.ndarray,
                       student_ids: List[int] = None) -> pd.DataFrame:
        """
        Compare baseline vs follow-up risk predictions.
        
        Args:
            baseline_probs: Baseline dropout probabilities
            followup_probs: Follow-up dropout probabilities
            student_ids: Student identifiers
            
        Returns:
            DataFrame with comparison analysis
        """
        if student_ids is None:
            student_ids = range(len(baseline_probs))
        
        comparison = pd.DataFrame({
            'student_id': student_ids,
            'baseline_risk_prob': baseline_probs,
            'baseline_risk_category': [self.categorize_risk(p) for p in baseline_probs],
            'followup_risk_prob': followup_probs,
            'followup_risk_category': [self.categorize_risk(p) for p in followup_probs],
        })
        
        # Calculate changes
        comparison['risk_change'] = comparison['followup_risk_prob'] - comparison['baseline_risk_prob']
        comparison['risk_change_pct'] = (comparison['risk_change'] / 
                                         (comparison['baseline_risk_prob'] + 1e-10)) * 100
        
        # Determine status
        comparison['status'] = comparison['risk_change'].apply(
            lambda x: 'Improved' if x < -0.05 else ('Worsened' if x > 0.05 else 'Stable')
        )
        
        return comparison
    
    def calculate_metrics(self, comparison_df: pd.DataFrame) -> Dict:
        """
        Calculate intervention effectiveness metrics.
        
        Args:
            comparison_df: Comparison DataFrame
            
        Returns:
            Dictionary with aggregate metrics
        """
        total = len(comparison_df)
        improved = len(comparison_df[comparison_df['status'] == 'Improved'])
        worsened = len(comparison_df[comparison_df['status'] == 'Worsened'])
        stable = len(comparison_df[comparison_df['status'] == 'Stable'])
        
        metrics = {
            'total_students': total,
            'improved': improved,
            'worsened': worsened,
            'stable': stable,
            'improvement_rate': (improved / total * 100) if total > 0 else 0,
            'deterioration_rate': (worsened / total * 100) if total > 0 else 0,
            'stability_rate': (stable / total * 100) if total > 0 else 0,
            'mean_risk_change': comparison_df['risk_change'].mean(),
            'median_risk_change': comparison_df['risk_change'].median(),
            'std_risk_change': comparison_df['risk_change'].std(),
            'avg_baseline_risk': comparison_df['baseline_risk_prob'].mean(),
            'avg_followup_risk': comparison_df['followup_risk_prob'].mean(),
            'max_improvement': comparison_df['risk_change'].min(),
            'max_deterioration': comparison_df['risk_change'].max(),
        }
        
        return metrics
    
    def generate_report(self, metrics: Dict, comparison_df: pd.DataFrame) -> str:
        """
        Generate formatted analysis report.
        
        Args:
            metrics: Metrics dictionary
            comparison_df: Comparison DataFrame
            
        Returns:
            Formatted report string
        """
        report = []
        report.append("=" * 70)
        report.append("INTERVENTION IMPACT ANALYSIS REPORT".center(70))
        report.append("=" * 70)
        report.append("")
        
        report.append("📊 SUMMARY")
        report.append(f"  Total students in intervention group: {metrics['total_students']}")
        report.append(f"  Analysis date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        report.append("")
        
        report.append("✅ IMPROVEMENT OUTCOMES")
        report.append(f"  Students improved:  {metrics['improved']:3d} ({metrics['improvement_rate']:5.1f}%)")
        report.append(f"  Students worsened:  {metrics['worsened']:3d} ({metrics['deterioration_rate']:5.1f}%)")
        report.append(f"  Students stable:    {metrics['stable']:3d} ({metrics['stability_rate']:5.1f}%)")
        report.append("")
        
        report.append("📈 RISK METRICS")
        report.append(f"  Average baseline risk:    {metrics['avg_baseline_risk']:.3f}")
        report.append(f"  Average follow-up risk:   {metrics['avg_followup_risk']:.3f}")
        report.append(f"  Mean risk change:         {metrics['mean_risk_change']:.4f}")
        report.append(f"  Median risk change:       {metrics['median_risk_change']:.4f}")
        report.append(f"  Std dev of changes:       {metrics['std_risk_change']:.4f}")
        report.append(f"  Max improvement:          {metrics['max_improvement']:.4f}")
        report.append(f"  Max deterioration:        {metrics['max_deterioration']:.4f}")
        report.append("")
        
        if metrics['mean_risk_change'] < -0.05:
            report.append("🎯 CONCLUSION: Interventions appear EFFECTIVE")
            report.append("   Average risk has decreased across the intervention group.")
        elif metrics['mean_risk_change'] > 0.05:
            report.append("⚠️  CONCLUSION: Interventions may need review")
            report.append("   Average risk has increased. Consider intervention adjustments.")
        else:
            report.append("➡️  CONCLUSION: Mixed results")
            report.append("   Average risk relatively stable. More data may be needed.")
        
        report.append("=" * 70)
        
        return "\n".join(report)
    
    def save_comparison_results(self, comparison_df: pd.DataFrame, metrics: Dict, 
                               filename: str = None) -> Path:
        """
        Save comparison results and metrics to files.
        
        Args:
            comparison_df: Comparison DataFrame
            metrics: Metrics dictionary
            filename: Base filename for output files
            
        Returns:
            Path to saved comparison CSV
        """
        if filename is None:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f'intervention_comparison_{timestamp}'
        
        # Save comparison data
        comparison_path = self.intervention_path / f'{filename}.csv'
        comparison_df.to_csv(comparison_path, index=False)
        
        # Save metrics
        metrics_path = self.intervention_path / f'{filename}_metrics.json'
        with open(metrics_path, 'w') as f:
            json.dump(metrics, f, indent=2)
        
        print(f"✓ Results saved to:")
        print(f"  - Comparison: {comparison_path}")
        print(f"  - Metrics: {metrics_path}")
        
        return comparison_path


def main():
    """Example usage of the InterventionAnalysis module."""
    
    print("Initializing Intervention Impact Analysis...")
    analyzer = InterventionAnalysis()
    
    # Step 1: Load baseline data
    print("\n1. Loading baseline data...")
    analyzer.load_baseline_data()
    
    # Step 2: Identify intervention recipients
    print("2. Identifying intervention recipients...")
    recipients = analyzer.get_intervention_recipients()
    print(f"   Found {len(recipients)} at-risk students")
    
    # Step 3: Create follow-up template
    print("3. Creating follow-up data template...")
    template = analyzer.create_followup_template(recipients)
    template_path = analyzer.intervention_path / 'followup_data_template.csv'
    template.to_csv(template_path, index=False)
    print(f"   Template saved to: {template_path}")
    
    # Step 4: Save baseline data for reference
    baseline_path = analyzer.intervention_path / 'intervention_recipients_baseline.csv'
    recipients.to_csv(baseline_path, index=False)
    print(f"\n✓ Baseline data saved to: {baseline_path}")
    print(f"\n📝 Next steps:")
    print(f"   1. Collect 6-month follow-up data")
    print(f"   2. Fill in the template: {template_path}")
    print(f"   3. Load follow-up data and run comparison analysis")


if __name__ == '__main__':
    main()
