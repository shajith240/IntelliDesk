"use client";

// FAQ article create/edit dialog with validation for question, answer, category, and optional URLs.
import { useRef, useState } from "react";
import { apiSend } from "@/lib/api-client";
import { CATEGORIES } from "@/lib/ticket-meta";
import { useToast } from "@/components/ui/toast";
import type { FAQ, FAQPayload, EmailCategory } from "@/types";

import {
	Dialog,
	DialogContent,
	DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label, Input, Textarea, FieldMessage } from "@/components/ui/field";
import { SectionMessage } from "@/components/ui/section-message";

interface ArticleDialogProps {
	article?: FAQ | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess: () => void;
}

interface ValidationErrors {
	question?: string;
	answer?: string;
	category?: string;
	videoUrl?: string;
	manualRef?: string;
}

export function ArticleDialog({
	article,
	open,
	onOpenChange,
	onSuccess,
}: ArticleDialogProps) {
	const { toast } = useToast();
	const submitRef = useRef(false);

	const [question, setQuestion] = useState(article?.question || "");
	const [answer, setAnswer] = useState(article?.answer || "");
	const [category, setCategory] = useState(article?.category || "");
	const [solutionSteps, setSolutionSteps] = useState(
		article?.solution_steps?.join("\n") || ""
	);
	const [videoUrl, setVideoUrl] = useState(article?.video_url || "");
	const [manualRef, setManualRef] = useState(article?.manual_ref || "");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [errors, setErrors] = useState<ValidationErrors>({});
	const [serverError, setServerError] = useState<string | null>(null);

	const validateForm = (): boolean => {
		const newErrors: ValidationErrors = {};

		if (!question.trim()) {
			newErrors.question = "Question is required";
		}

		if (!answer.trim()) {
			newErrors.answer = "Answer is required";
		}

		if (!category) {
			newErrors.category = "Category is required";
		}

		if (videoUrl && !videoUrl.startsWith("http://") && !videoUrl.startsWith("https://")) {
			newErrors.videoUrl = "Video URL must start with http:// or https://";
		}

		if (manualRef && !manualRef.startsWith("http://") && !manualRef.startsWith("https://")) {
			newErrors.manualRef = "Manual URL must start with http:// or https://";
		}

		setErrors(newErrors);

		// Focus first invalid field
		if (Object.keys(newErrors).length > 0) {
			const firstError = Object.keys(newErrors)[0];
			if (firstError === "question") {
				document.getElementById("question")?.focus();
			} else if (firstError === "answer") {
				document.getElementById("answer")?.focus();
			} else if (firstError === "category") {
				document.getElementById("category")?.focus();
			} else if (firstError === "videoUrl") {
				document.getElementById("video-url")?.focus();
			} else if (firstError === "manualRef") {
				document.getElementById("manual-ref")?.focus();
			}
		}

		return Object.keys(newErrors).length === 0;
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		// Use ref to guard against double submission while validation or request is in flight.
		if (submitRef.current || isSubmitting) return;
		submitRef.current = true;

		if (!validateForm()) {
			submitRef.current = false;
			return;
		}

		setIsSubmitting(true);
		setServerError(null);

		try {
			const payload: FAQPayload = {
				question: question.trim(),
				answer: answer.trim(),
				category: category as EmailCategory,
				solution_steps: solutionSteps
					.split("\n")
					.map((s) => s.trim())
					.filter((s) => s.length > 0),
				video_url: videoUrl.trim() || undefined,
				manual_ref: manualRef.trim() || undefined,
			};

			if (article) {
				await apiSend(`/api/faqs/${article.id}`, "PUT", payload);
				toast({
					tone: "success",
					title: "Article updated",
				});
			} else {
				await apiSend("/api/faqs", "POST", payload);
				toast({
					tone: "success",
					title: "Article created",
				});
			}

			onSuccess();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to save article";
			setServerError(message);
		} finally {
			setIsSubmitting(false);
			submitRef.current = false;
		}
	};

	const handleOpenChange = (newOpen: boolean) => {
		if (isSubmitting) return;
		onOpenChange(newOpen);
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent
				size="lg"
				title={article ? "Edit article" : "New article"}
				description="Saving re-indexes the article for AI retrieval."
			>
				<form onSubmit={handleSubmit} className="space-y-4">
					{serverError && (
						<SectionMessage appearance="error">{serverError}</SectionMessage>
					)}

					{/* Question */}
					<div>
						<Label htmlFor="question">
							Question <span className="text-danger">*</span>
						</Label>
						<Input
							id="question"
							value={question}
							onChange={(e) => setQuestion(e.currentTarget.value)}
							placeholder="What is this article about?"
							invalid={!!errors.question}
							aria-describedby={errors.question ? "question-error" : undefined}
						/>
						{errors.question && (
							<FieldMessage id="question-error" tone="error">
								{errors.question}
							</FieldMessage>
						)}
					</div>

					{/* Answer */}
					<div>
						<Label htmlFor="answer">
							Answer <span className="text-danger">*</span>
						</Label>
						<Textarea
							id="answer"
							value={answer}
							onChange={(e) => setAnswer(e.currentTarget.value)}
							placeholder="Detailed answer to the question..."
							className="min-h-[160px]"
							invalid={!!errors.answer}
							aria-describedby={errors.answer ? "answer-error" : undefined}
						/>
						{errors.answer && (
							<FieldMessage id="answer-error" tone="error">
								{errors.answer}
							</FieldMessage>
						)}
					</div>

					{/* Category */}
					<div>
						<Label htmlFor="category">
							Category <span className="text-danger">*</span>
						</Label>
						<select
							id="category"
							value={category}
							onChange={(e) => setCategory(e.currentTarget.value)}
							className="h-8 w-full rounded-md border border-border-bold bg-background px-2 text-sm text-foreground"
							aria-describedby={errors.category ? "category-error" : undefined}
						>
							<option value="">Select a category</option>
							{CATEGORIES.map((cat) => (
								<option key={cat} value={cat}>
									{cat}
								</option>
							))}
						</select>
						{errors.category && (
							<FieldMessage id="category-error" tone="error">
								{errors.category}
							</FieldMessage>
						)}
					</div>

					{/* Solution Steps */}
					<div>
						<Label htmlFor="solution-steps">Solution steps</Label>
						<Textarea
							id="solution-steps"
							value={solutionSteps}
							onChange={(e) => setSolutionSteps(e.currentTarget.value)}
							placeholder="One step per line"
							className="min-h-[100px]"
						/>
						<FieldMessage id="solution-steps-hint" tone="hint">
							One step per line
						</FieldMessage>
					</div>

					{/* Video URL */}
					<div>
						<Label htmlFor="video-url">Video URL</Label>
						<Input
							id="video-url"
							type="url"
							value={videoUrl}
							onChange={(e) => setVideoUrl(e.currentTarget.value)}
							placeholder="https://example.com/video"
							invalid={!!errors.videoUrl}
							aria-describedby={errors.videoUrl ? "video-url-error" : undefined}
						/>
						{errors.videoUrl && (
							<FieldMessage id="video-url-error" tone="error">
								{errors.videoUrl}
							</FieldMessage>
						)}
					</div>

					{/* Manual Reference */}
					<div>
						<Label htmlFor="manual-ref">Manual reference</Label>
						<Input
							id="manual-ref"
							type="url"
							value={manualRef}
							onChange={(e) => setManualRef(e.currentTarget.value)}
							placeholder="https://example.com/docs"
							invalid={!!errors.manualRef}
							aria-describedby={errors.manualRef ? "manual-ref-error" : undefined}
						/>
						{errors.manualRef && (
							<FieldMessage id="manual-ref-error" tone="error">
								{errors.manualRef}
							</FieldMessage>
						)}
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="secondary"
							onClick={() => handleOpenChange(false)}
							disabled={isSubmitting}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							variant="primary"
							loading={isSubmitting}
							disabled={submitRef.current}
						>
							{article ? "Update article" : "Create article"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
