from typer.testing import CliRunner

from konomi.cli import app


def test_recommend_without_sync_explains_next_step(tmp_path):
    result = CliRunner().invoke(app, ["recommend", "someone", "--db", str(tmp_path / "c.sqlite")])
    assert result.exit_code == 1
    assert "konomi sync someone" in result.output


def test_exclude_add_show_remove(tmp_path):
    db = ["--db", str(tmp_path / "c.sqlite")]
    run = CliRunner().invoke
    args = [
        "--title",
        "40",
        "--tag",
        "Gore",
        "--genre",
        "Ecchi",
        "--list",
        "Example",
        "-t",
        "manga",
    ]
    assert run(app, ["exclude", "add", "someone", *args, *db]).exit_code == 0
    shown = run(app, ["exclude", "show", "someone", "-t", "manga", *db]).output
    assert "40" in shown and "genre:Ecchi" in shown and "tag:Gore" in shown and "Example" in shown
    run(app, ["exclude", "remove", "someone", "--tag", "Gore", *db])
    assert "tag:Gore" not in run(app, ["exclude", "show", "someone", *db]).output
